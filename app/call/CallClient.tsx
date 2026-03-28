"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChalkboardRoomShell } from "../room/ChalkboardRoomShell";
import { supabase } from "@/lib/supabaseClient";
import { getOrCreateDeviceId } from "@/lib/device";

type SessionStatusResult = {
  ok: boolean;
  session?: {
    id: string;
    topic: string;
    status: "forming" | "active" | "closed";
    capacity: number;
    created_at: string;
  };
  members?: {
    display_name: string;
    joined_at: string;
    photo_path?: string | null;
  }[];
  memberCount?: number;
  error?: string;
};

type StrokePoint = { x: number; y: number };
type ChalkStrokeRow = {
  id: string;
  session_id: string;
  device_id: string;
  display_name: string;
  color: string;
  width: number;
  points: StrokePoint[];
  kind: "stroke" | "clear";
  created_at: string;
};

function sanitizeDisplayName(v: string | null | undefined) {
  const s = String(v ?? "").trim();
  if (!s || s === "You") return "参加者";
  return s;
}

async function readJsonBestEffort(res: Response) {
  const text = await res.text().catch(() => "");
  try {
    return { ok: res.ok, status: res.status, json: JSON.parse(text), text };
  } catch {
    return { ok: res.ok, status: res.status, json: null as any, text };
  }
}

/** ===== マイク制御 ===== */
function setMicMuted(stream: MediaStream | null, muted: boolean) {
  if (!stream) return;
  for (const t of stream.getAudioTracks()) t.enabled = !muted;
}
function stopStream(stream: MediaStream | null) {
  if (!stream) return;
  for (const t of stream.getTracks()) t.stop();
}

function AvatarChip({
  name,
  filled,
  photo,
}: {
  name: string;
  filled: boolean;
  photo?: string | null;
}) {
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase();

  return (
    <div style={{ display: "grid", gap: 6, placeItems: "center" }}>
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 999,
          border: "2px solid #111",
          overflow: "hidden",
          display: "grid",
          placeItems: "center",
          background: filled ? "#fff" : "#f0f0f0",
          color: "#111",
          boxShadow: filled ? "0 2px 10px rgba(0,0,0,0.12)" : "none",
        }}
        title={filled ? name : "未参加"}
      >
        {filled && photo ? (
          <img
            src={photo}
            alt={name}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : filled ? (
          <span style={{ fontWeight: 900, fontSize: 16 }}>{initial}</span>
        ) : (
          <span style={{ color: "#aaa", fontWeight: 900 }}>○</span>
        )}
      </div>

      <div
        style={{
          fontSize: 11,
          fontWeight: 900,
          color: filled ? "#111" : "#9ca3af",
          width: 60,
          textAlign: "center",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {filled ? name : "未参加"}
      </div>
    </div>
  );
}

/** ===== 描画 ===== */
function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: { color: string; width: number; points: StrokePoint[] },
  canvasW: number,
  canvasH: number
) {
  const pts = stroke.points;
  if (!pts || pts.length === 0) return;

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.miterLimit = 1;

  ctx.strokeStyle = stroke.color || "#ffffff";
  ctx.lineWidth = Math.max(1, stroke.width || 6);

  ctx.beginPath();
  const p0 = pts[0];
  ctx.moveTo(p0.x * canvasW, p0.y * canvasH);

  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    ctx.lineTo(p.x * canvasW, p.y * canvasH);
  }
  ctx.stroke();
  ctx.restore();
}

/** ===== ムラを固定（sessionIdでseed固定）===== */
function hashToSeed(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function makeRng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** ===== 音（リアル寄りチョーク + コンコン） ===== */
function useBoardSounds() {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);

  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const chalkGainRef = useRef<GainNode | null>(null);
  const bpRef = useRef<BiquadFilterNode | null>(null);

  const lfoRef = useRef<OscillatorNode | null>(null);
  const lfoGainRef = useRef<GainNode | null>(null);

  const ensure = () => {
    if (ctxRef.current) return;
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as any;
    if (!Ctx) return;

    const ctx = new Ctx();

    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    ctxRef.current = ctx;
    masterRef.current = master;
  };

  const resumeIfNeeded = () => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  };

  const startIfNeeded = () => {
    ensure();
    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;

    resumeIfNeeded();
    if (srcRef.current) return;

    const bufferSize = Math.floor(ctx.sampleRate * 2.0);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 650;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2600;
    bp.Q.value = 0.9;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 9500;

    const chalkGain = ctx.createGain();
    chalkGain.gain.value = 0.0;

    const lfo = ctx.createOscillator();
    lfo.type = "triangle";
    lfo.frequency.value = 16;

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.12;

    lfo.connect(lfoGain);
    lfoGain.connect(chalkGain.gain);

    src.connect(hp);
    hp.connect(bp);
    bp.connect(lp);
    lp.connect(chalkGain);
    chalkGain.connect(master);

    src.start();
    lfo.start();

    srcRef.current = src;
    chalkGainRef.current = chalkGain;
    bpRef.current = bp;
    lfoRef.current = lfo;
    lfoGainRef.current = lfoGain;
  };

  const dispose = () => {
    try {
      srcRef.current?.stop();
    } catch {}
    try {
      lfoRef.current?.stop();
    } catch {}

    try {
      srcRef.current?.disconnect();
    } catch {}
    try {
      lfoRef.current?.disconnect();
    } catch {}
    try {
      chalkGainRef.current?.disconnect();
    } catch {}
    try {
      bpRef.current?.disconnect();
    } catch {}
    try {
      lfoGainRef.current?.disconnect();
    } catch {}

    srcRef.current = null;
    lfoRef.current = null;
    chalkGainRef.current = null;
    bpRef.current = null;
    lfoGainRef.current = null;

    const ctx = ctxRef.current;
    ctxRef.current = null;
    masterRef.current = null;

    try {
      ctx?.close();
    } catch {}
  };

  const chalkStart = () => {
    startIfNeeded();
    const ctx = ctxRef.current;
    const g = chalkGainRef.current;
    if (!ctx || !g) return;

    const t = ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(0.03, t, 0.02);
  };

  const chalkMove = (speed01: number, pressure01: number) => {
    startIfNeeded();
    const ctx = ctxRef.current;
    const g = chalkGainRef.current;
    const bp = bpRef.current;
    const lfoG = lfoGainRef.current;
    if (!ctx || !g || !bp || !lfoG) return;

    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    const s = clamp01(speed01);
    const p = clamp01(pressure01);

    const amp = 0.015 + 0.10 * s + 0.14 * p;
    const f = 2100 + 2600 * s - 900 * p;
    const gateDepth = 0.08 + 0.35 * p;

    const t = ctx.currentTime;
    bp.frequency.setTargetAtTime(f, t, 0.03);
    lfoG.gain.setTargetAtTime(gateDepth, t, 0.05);
    g.gain.setTargetAtTime(amp, t, 0.02);
  };

  const chalkEnd = () => {
    const ctx = ctxRef.current;
    const g = chalkGainRef.current;
    if (!ctx || !g) return;

    const t = ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(0.0, t, 0.03);
  };

  const konkon = (strength = 1) => {
    ensure();
    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;
    resumeIfNeeded();

    const t0 = ctx.currentTime;

    const o1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    o1.type = "sine";
    o1.frequency.setValueAtTime(240, t0);
    o1.frequency.exponentialRampToValueAtTime(140, t0 + 0.06);
    g1.gain.setValueAtTime(0.0001, t0);
    g1.gain.exponentialRampToValueAtTime(0.18 * strength, t0 + 0.01);
    g1.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
    o1.connect(g1);
    g1.connect(master);

    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    o2.type = "triangle";
    o2.frequency.setValueAtTime(1200, t0);
    g2.gain.setValueAtTime(0.0001, t0);
    g2.gain.exponentialRampToValueAtTime(0.05 * strength, t0 + 0.005);
    g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.03);
    o2.connect(g2);
    g2.connect(master);

    o1.start(t0);
    o2.start(t0);
    o1.stop(t0 + 0.11);
    o2.stop(t0 + 0.04);
  };

  return { chalkStart, chalkMove, chalkEnd, konkon, dispose };
}

/** ===== 共有黒板 ===== */
function SharedCanvasBoard({ sessionId }: { sessionId: string }) {
  const deviceIdRef = useRef("");
  const displayNameRef = useRef("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const drawingRef = useRef(false);
  const pointsRef = useRef<StrokePoint[]>([]);
  const lastPtRef = useRef<StrokePoint | null>(null);

  const lastMoveRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const lastKonkonRef = useRef(0);

  const watchdogRef = useRef<number | null>(null);
  const lastInputAtRef = useRef(0);

  const [penWidth, setPenWidth] = useState(6);
  const [penColor, setPenColor] = useState("#ffffff");
  const [info, setInfo] = useState("");

  const seedRef = useRef(0);
  const sounds = useBoardSounds();

  useEffect(() => {
    deviceIdRef.current = getOrCreateDeviceId();
    try {
      displayNameRef.current = sanitizeDisplayName(
        localStorage.getItem("classmate_display_name") ||
          localStorage.getItem("display_name") ||
          "参加者"
      );
    } catch {
      displayNameRef.current = "参加者";
    }
  }, []);

  useEffect(() => {
    seedRef.current = hashToSeed(sessionId || "default");
  }, [sessionId]);

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = wrap.getBoundingClientRect();
    const w = Math.max(300, Math.floor(rect.width));
    const h = Math.max(260, Math.floor(rect.height));

    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const paintBoardBase = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = parseInt(canvas.style.width || "0", 10) || canvas.width;
    const h = parseInt(canvas.style.height || "0", 10) || canvas.height;

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, w, h);

    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#0a3328");
    grad.addColorStop(1, "#06251d");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const rng = makeRng(seedRef.current);
    ctx.globalAlpha = 0.028;
    for (let i = 0; i < 900; i++) {
      const x = rng() * w;
      const y = rng() * h;
      const r = 0.5 + rng() * 1.6;
      ctx.fillStyle = rng() > 0.5 ? "#ffffff" : "#000000";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const rng2 = makeRng(seedRef.current ^ 0x9e3779b9);
    ctx.globalAlpha = 0.015;
    for (let i = 0; i < 1200; i++) {
      const x = rng2() * w;
      const y = rng2() * h;
      const r = 0.6 + rng2() * 2.2;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  };

  const clearLocal = () => paintBoardBase();

  useEffect(() => {
    if (!sessionId) return;

    const boot = async () => {
      setInfo("");
      resizeCanvas();
      paintBoardBase();

      const { data, error } = await supabase
        .from("call_chalk_strokes")
        .select("id, session_id, device_id, display_name, color, width, points, kind, created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true })
        .limit(500);

      if (error) {
        setInfo(`黒板ロード失敗: ${error.message}`);
        return;
      }

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      const w = parseInt(canvas.style.width || "0", 10) || canvas.width;
      const h = parseInt(canvas.style.height || "0", 10) || canvas.height;

      for (const row of (data ?? []) as any as ChalkStrokeRow[]) {
        if (row.kind === "clear") {
          clearLocal();
          continue;
        }
        drawStroke(
          ctx,
          { color: row.color, width: row.width, points: row.points as any },
          w,
          h
        );
      }
    };

    void boot();
  }, [sessionId]);

  useEffect(() => {
    const onResize = () => {
      void (async () => {
        resizeCanvas();
        paintBoardBase();

        const { data } = await supabase
          .from("call_chalk_strokes")
          .select("color,width,points,kind,created_at")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true })
          .limit(500);

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;

        const w = parseInt(canvas.style.width || "0", 10) || canvas.width;
        const h = parseInt(canvas.style.height || "0", 10) || canvas.height;

        for (const row of (data ?? []) as any as ChalkStrokeRow[]) {
          if ((row as any).kind === "clear") {
            clearLocal();
            continue;
          }
          drawStroke(
            ctx,
            {
              color: (row as any).color,
              width: (row as any).width,
              points: (row as any).points,
            },
            w,
            h
          );
        }
      })();
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    const ch = supabase
      .channel(`chalk_strokes:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "call_chalk_strokes",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload: any) => {
          const row = payload?.new as ChalkStrokeRow;
          if (!row?.id) return;
          if (row.device_id === deviceIdRef.current) return;

          const canvas = canvasRef.current;
          const ctx = canvas?.getContext("2d");
          if (!canvas || !ctx) return;

          const w = parseInt(canvas.style.width || "0", 10) || canvas.width;
          const h = parseInt(canvas.style.height || "0", 10) || canvas.height;

          if (row.kind === "clear") {
            clearLocal();
            return;
          }
          drawStroke(
            ctx,
            { color: row.color, width: row.width, points: row.points as any },
            w,
            h
          );
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(ch);
    };
  }, [sessionId]);

  const getNormPoint = (e: PointerEvent): StrokePoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  };

  const drawLocalSegment = (from: StrokePoint, to: StrokePoint) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const w = parseInt(canvas.style.width || "0", 10) || canvas.width;
    const h = parseInt(canvas.style.height || "0", 10) || canvas.height;

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.miterLimit = 1;
    ctx.strokeStyle = penColor;
    ctx.lineWidth = Math.max(1, penWidth);

    ctx.beginPath();
    ctx.moveTo(from.x * w, from.y * h);
    ctx.lineTo(to.x * w, to.y * h);
    ctx.stroke();
    ctx.restore();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const forceEnd = () => {
      drawingRef.current = false;
      lastMoveRef.current = null;
      lastPtRef.current = null;
      pointsRef.current = [];
      sounds.dispose();
    };

    const finalizeAndSend = async () => {
      drawingRef.current = false;
      lastMoveRef.current = null;

      const pts = pointsRef.current;
      pointsRef.current = [];
      lastPtRef.current = null;

      sounds.dispose();

      if (!pts || pts.length < 2) return;

      const safeName = sanitizeDisplayName(displayNameRef.current);

      const { error } = await supabase.from("call_chalk_strokes").insert({
        session_id: sessionId,
        device_id: deviceIdRef.current,
        display_name: safeName,
        color: penColor,
        width: penWidth,
        points: pts,
        kind: "stroke",
      });

      if (error) setInfo(`送信失敗: ${error.message}`);
      else setInfo("");
    };

    const onDown = (ev: PointerEvent) => {
      ev.preventDefault();
      (ev.target as any)?.setPointerCapture?.(ev.pointerId);

      const p = getNormPoint(ev);
      if (!p) return;

      drawingRef.current = true;
      pointsRef.current = [p];
      lastPtRef.current = p;
      lastMoveRef.current = { t: performance.now(), x: p.x, y: p.y };

      lastInputAtRef.current = performance.now();

      const now = performance.now();
      if (now - lastKonkonRef.current > 400) {
        lastKonkonRef.current = now;
        sounds.konkon(0.22);
      }

      sounds.chalkStart();
    };

    const onMove = (ev: PointerEvent) => {
      if (!drawingRef.current) return;
      ev.preventDefault();

      const p = getNormPoint(ev);
      const last = lastPtRef.current;
      if (!p || !last) return;

      const dx = p.x - last.x;
      const dy = p.y - last.y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 < 0.000015) return;

      pointsRef.current.push(p);
      drawLocalSegment(last, p);
      lastPtRef.current = p;

      const prev = lastMoveRef.current;
      const now = performance.now();
      if (prev) {
        const w = parseInt(canvas.style.width || "0", 10) || canvas.width;
        const h = parseInt(canvas.style.height || "0", 10) || canvas.height;

        const dt = Math.max(1, now - prev.t);
        const dxPx = (p.x - prev.x) * w;
        const dyPx = (p.y - prev.y) * h;
        const distPx = Math.sqrt(dxPx * dxPx + dyPx * dyPx);

        const speed01 = Math.max(0, Math.min(1, (distPx / dt) / 1.8));
        const pressure01 = Math.max(
          0,
          Math.min(1, 0.75 * (1 - speed01) + 0.02 * (penWidth - 2))
        );

        sounds.chalkMove(speed01, pressure01);
      }

      lastMoveRef.current = { t: now, x: p.x, y: p.y };
      lastInputAtRef.current = now;
    };

    const onUp = (ev: PointerEvent) => {
      ev.preventDefault();
      if (!drawingRef.current) {
        forceEnd();
        return;
      }
      void finalizeAndSend();
    };

    const onCancel = (ev: Event) => {
      ev.preventDefault?.();
      forceEnd();
    };

    const onLeave = (ev: Event) => {
      ev.preventDefault?.();
      forceEnd();
    };

    const onCtx = (ev: Event) => {
      ev.preventDefault?.();
      forceEnd();
    };

    const onBlur = () => forceEnd();
    const onVis = () => {
      if (document.hidden) forceEnd();
    };

    if (watchdogRef.current) window.clearInterval(watchdogRef.current);
    watchdogRef.current = window.setInterval(() => {
      const dt = performance.now() - lastInputAtRef.current;
      if (dt > 220) sounds.dispose();
    }, 140);

    canvas.addEventListener("pointerdown", onDown, { passive: false });
    canvas.addEventListener("pointermove", onMove, { passive: false });
    canvas.addEventListener("pointerup", onUp, { passive: false });
    canvas.addEventListener("pointercancel", onCancel as any, { passive: false });
    canvas.addEventListener("lostpointercapture", onCancel as any, {
      passive: false,
    });
    canvas.addEventListener("pointerleave", onLeave as any, { passive: false });
    canvas.addEventListener("contextmenu", onCtx as any, { passive: false });

    window.addEventListener("pointerup", onUp, { passive: false });
    window.addEventListener("pointercancel", onCancel as any, { passive: false });
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel as any);
      canvas.removeEventListener("lostpointercapture", onCancel as any);
      canvas.removeEventListener("pointerleave", onLeave as any);
      canvas.removeEventListener("contextmenu", onCtx as any);

      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel as any);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);

      if (watchdogRef.current) window.clearInterval(watchdogRef.current);
      watchdogRef.current = null;

      forceEnd();
      sounds.dispose();
    };
  }, [sessionId, penColor, penWidth]);

  const onClear = async () => {
    clearLocal();

    const safeName = sanitizeDisplayName(displayNameRef.current);

    const { error } = await supabase.from("call_chalk_strokes").insert({
      session_id: sessionId,
      device_id: deviceIdRef.current,
      display_name: safeName,
      color: penColor,
      width: penWidth,
      points: [],
      kind: "clear",
    });

    if (error) setInfo(`クリア送信失敗: ${error.message}`);
    else setInfo("");
  };

  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontWeight: 900 }}>黒板（ペン対応・共有）</div>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <label
            style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}
          >
            太さ
            <input
              type="range"
              min={2}
              max={14}
              value={penWidth}
              onChange={(e) => setPenWidth(Number(e.target.value))}
              style={{ marginLeft: 8, verticalAlign: "middle" }}
            />
          </label>

          <label
            style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}
          >
            色
            <input
              type="color"
              value={penColor}
              onChange={(e) => setPenColor(e.target.value)}
              style={{
                marginLeft: 8,
                width: 34,
                height: 28,
                border: "none",
                background: "transparent",
              }}
            />
          </label>

          <button
            onClick={onClear}
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              border: "1px solid #ddd",
              background: "#fff",
              color: "#111",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            全消し
          </button>
        </div>
      </div>

      <div
        ref={wrapRef}
        style={{
          marginTop: 10,
          height: 460,
          borderRadius: 16,
          border: "2px solid #073126",
          background: "#0b3b2e",
          boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.06)",
          overflow: "hidden",
          touchAction: "none",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ display: "block", width: "100%", height: "100%" }}
        />
      </div>

      <div
        style={{ marginTop: 8, fontSize: 11, color: "#6b7280", fontWeight: 900 }}
      >
        ※ タッチペン/指で書けます。みんなの線はリアルタイムで反映されます。
        {info ? `（${info}）` : ""}
      </div>
    </div>
  );
}

export default function CallClient() {
  const router = useRouter();

  const [sessionId, setSessionId] = useState<string>("");
  const [returnTo, setReturnTo] = useState<string>("/class/select");

  const [status, setStatus] = useState<"forming" | "active" | "closed">(
    "forming"
  );
  const [capacity, setCapacity] = useState(5);
  const [memberCount, setMemberCount] = useState(0);
  const [members, setMembers] = useState<
    { display_name: string; joined_at: string; photo_path?: string | null }[]
  >([]);
  const [err, setErr] = useState("");

  const pollTimer = useRef<number | null>(null);

  /** マイク */
  const localStreamRef = useRef<MediaStream | null>(null);
  const [micReady, setMicReady] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const sid = (sp.get("sessionId") ?? "").trim();
    const rt = (sp.get("returnTo") ?? "").trim();

    if (!sid) {
      setErr("sessionId がありません");
      return;
    }
    setSessionId(sid);
    setReturnTo(rt ? rt : `/room?sessionId=${encodeURIComponent(sid)}`);
  }, []);

  useEffect(() => {
    if (!sessionId) return;

    const rawName =
      localStorage.getItem("classmate_display_name") ||
      localStorage.getItem("display_name") ||
      "参加者";

    const name = sanitizeDisplayName(rawName);
    const deviceId = getOrCreateDeviceId();

    fetch("/api/session/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, name, deviceId }),
    }).catch(() => {});
  }, [sessionId]);

  async function fetchStatus(sid: string) {
    try {
      const res = await fetch(
        `/api/session/status?sessionId=${encodeURIComponent(sid)}`,
        {
          cache: "no-store",
        }
      );
      const r = await readJsonBestEffort(res);
      const j = (r.json ?? {}) as SessionStatusResult;

      if (!r.ok || !j.ok) {
        setErr(j?.error ?? r.text ?? "status_failed");
        return;
      }

      const mc = Number(j.memberCount ?? (j.members?.length ?? 0));
      const cap = Number(j.session?.capacity ?? 5);

      setStatus(j.session?.status ?? "forming");
      setCapacity(Number.isFinite(cap) && cap > 0 ? cap : 5);
      setMembers(j.members ?? []);
      setMemberCount(mc);
      setErr("");
    } catch (e: any) {
      setErr(e?.message ?? "status_failed");
    }
  }

  useEffect(() => {
    if (!sessionId) return;
    void fetchStatus(sessionId);

    if (pollTimer.current) window.clearInterval(pollTimer.current);
    pollTimer.current = window.setInterval(() => void fetchStatus(sessionId), 5000);

    return () => {
      if (pollTimer.current) window.clearInterval(pollTimer.current);
      pollTimer.current = null;
    };
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!sessionId) return;
      if (localStreamRef.current) return;

      try {
        setMicReady(false);
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });

        if (cancelled) {
          stopStream(stream);
          return;
        }

        localStreamRef.current = stream;
        setMicMuted(stream, isMuted);
        setMicReady(true);
      } catch (e: any) {
        setErr(e?.message ?? "マイク取得に失敗しました");
        setMicReady(false);
      }
    })();

    return () => {
      cancelled = true;
      stopStream(localStreamRef.current);
      localStreamRef.current = null;
      setMicReady(false);
    };
  }, [sessionId, isMuted]);

  const filled = Math.min(
    (members?.length ?? 0) > 0 ? members.length : memberCount,
    capacity
  );

  const micStateLabel = isMuted ? "🔇 ミュート中" : "🎙 マイクON";
  const muteButtonLabel = isMuted ? "ミュート解除" : "ミュート";

  return (
    <ChalkboardRoomShell
      title="通話"
      subtitle={sessionId ? `セッション：${sessionId}` : undefined}
      lines={["黒板はペンで書けます。", "待機ルームでメッセージ、通話で黒板。"]}
    >
      <div style={{ display: "grid", gap: 12, color: "#111" }}>
        {err ? (
          <div
            style={{
              padding: 10,
              border: "1px solid #f5c2c7",
              background: "#f8d7da",
              borderRadius: 10,
              color: "#842029",
            }}
          >
            <p style={{ margin: 0, fontWeight: 900 }}>エラー</p>
            <p style={{ margin: "6px 0 0 0" }}>{err}</p>
          </div>
        ) : null}

        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: 14,
            padding: 12,
            background: "#fff",
          }}
        >
          <div style={{ fontWeight: 900 }}>クラス</div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
            参加者：<b>{memberCount}</b> / {capacity} ・ 状態：
            {status === "active"
              ? "通話中"
              : status === "closed"
              ? "終了"
              : "待機"}{" "}
            ・ マイク：{micReady ? micStateLabel : "未許可/準備中"}
          </div>

          <div
            style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}
          >
            {Array.from({ length: capacity }).map((_, i) => {
              const m = members[i];
              const isFilled = i < filled;

              return (
                <AvatarChip
                  key={i}
                  name={m?.display_name ?? "参加者"}
                  photo={m?.photo_path}
                  filled={isFilled}
                />
              );
            })}
          </div>

          {sessionId ? <SharedCanvasBoard sessionId={sessionId} /> : null}

          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #eee" }}>
            <div style={{ fontWeight: 900 }}>通話コントロール</div>

            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                disabled={!micReady}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  background: isMuted ? "#fff" : "#111",
                  color: isMuted ? "#111" : "#fff",
                  fontWeight: 900,
                  cursor: micReady ? "pointer" : "not-allowed",
                  opacity: micReady ? 1 : 0.6,
                }}
                onClick={() => {
                  setIsMuted((prev) => {
                    const next = !prev;
                    setMicMuted(localStreamRef.current, next);
                    return next;
                  });
                }}
              >
                {muteButtonLabel}
              </button>

              <button
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #fca5a5",
                  background: "#fee2e2",
                  color: "#7f1d1d",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
                onClick={() => router.push(returnTo)}
              >
                退出
              </button>
            </div>
          </div>
        </div>
      </div>
    </ChalkboardRoomShell>
  );
}