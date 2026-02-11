// app/call/CallClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  members?: { display_name: string; joined_at: string }[];
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

function AvatarChip({ name, filled }: { name: string; filled: boolean }) {
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase();
  return (
    <div style={{ display: "grid", gap: 6, placeItems: "center" }}>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 999,
          border: "2px solid #111",
          background: filled ? "#111" : "#f0f0f0",
          color: filled ? "#fff" : "#aaa",
          display: "grid",
          placeItems: "center",
          fontWeight: 900,
          fontSize: 16,
          boxShadow: filled ? "0 2px 10px rgba(0,0,0,0.18)" : "none",
        }}
        title={filled ? name : "未参加"}
      >
        {filled ? initial : "○"}
      </div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 900,
          color: filled ? "#111" : "#9ca3af",
          width: 54,
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

/** ===== 音（チョーク + コンコン） : WebAudio、ファイル不要 ===== */
function useBoardSounds() {
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const noiseRef = useRef<AudioBufferSourceNode | null>(null);
  const lastTickRef = useRef(0);

  const ensure = () => {
    if (ctxRef.current) return;
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as any;
    if (!Ctx) return;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    ctxRef.current = ctx;
    gainRef.current = master;
  };

  const resumeIfNeeded = () => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  };

  const startNoise = () => {
    ensure();
    const ctx = ctxRef.current;
    const master = gainRef.current;
    if (!ctx || !master) return;

    resumeIfNeeded();

    if (noiseRef.current) return;

    // 1秒ノイズをループ
    const bufferSize = Math.floor(ctx.sampleRate * 1.0);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.4;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    // チョークっぽく：ハイパス + ちょい共鳴
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 700;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.9;

    const g = ctx.createGain();
    g.gain.value = 0;

    src.connect(hp);
    hp.connect(bp);
    bp.connect(g);
    g.connect(master);

    src.start();
    noiseRef.current = src;

    // 保存しておきたいので gainをnodeとして取れるようにする
    // （masterは常時、gがチョーク音の音量）
    (gainRef as any).chalkGain = g;
  };

  const stopNoise = () => {
    const ctx = ctxRef.current;
    const cg: GainNode | null = (gainRef as any).chalkGain ?? null;
    if (ctx && cg) {
      const t = ctx.currentTime;
      cg.gain.cancelScheduledValues(t);
      cg.gain.setTargetAtTime(0, t, 0.02);
    }

    const src = noiseRef.current;
    noiseRef.current = null;
    try {
      src?.stop();
      src?.disconnect();
    } catch {}
  };

  const chalkTick = (intensity = 1) => {
    // 連打しすぎ防止（50ms）
    const now = performance.now();
    if (now - lastTickRef.current < 50) return;
    lastTickRef.current = now;

    startNoise();
    const ctx = ctxRef.current;
    const cg: GainNode | null = (gainRef as any).chalkGain ?? null;
    if (!ctx || !cg) return;

    const t = ctx.currentTime;
    const target = Math.min(0.09, 0.02 + 0.04 * intensity);

    cg.gain.cancelScheduledValues(t);
    cg.gain.setTargetAtTime(target, t, 0.008);
    cg.gain.setTargetAtTime(0.0, t + 0.05, 0.02);
  };

  const konkon = (strength = 1) => {
    ensure();
    const ctx = ctxRef.current;
    const master = gainRef.current;
    if (!ctx || !master) return;
    resumeIfNeeded();

    const t0 = ctx.currentTime;

    // 低めの短い音 + 高めのクリック（2発合成）
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

  return { chalkTick, stopNoise, konkon };
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

  const [penWidth, setPenWidth] = useState(6);
  const [penColor, setPenColor] = useState("#ffffff"); // ✅ 純白
  const [info, setInfo] = useState("");

  const seedRef = useRef(0);
  const sounds = useBoardSounds();

  useEffect(() => {
    deviceIdRef.current = getOrCreateDeviceId();
    try {
      displayNameRef.current =
        localStorage.getItem("classmate_display_name") ||
        localStorage.getItem("display_name") ||
        "You";
    } catch {
      displayNameRef.current = "You";
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

    // 黒板（緑寄りを抑えて、深い黒板色に寄せる）
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#0a3328");
    grad.addColorStop(1, "#06251d");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // ムラ：seed固定で「毎回同じ」
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
    ctx.restore();
  };

  const clearLocal = () => paintBoardBase();

  // 初回ロード
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
        drawStroke(ctx, { color: row.color, width: row.width, points: row.points as any }, w, h);
      }
    };

    boot();
  }, [sessionId]);

  // リサイズ時：再描画
  useEffect(() => {
    const onResize = () => {
      (async () => {
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
          drawStroke(ctx, { color: (row as any).color, width: (row as any).width, points: (row as any).points }, w, h);
        }
      })();
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [sessionId]);

  // realtime
  useEffect(() => {
    if (!sessionId) return;

    const ch = supabase
      .channel(`chalk_strokes:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "call_chalk_strokes", filter: `session_id=eq.${sessionId}` },
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
          drawStroke(ctx, { color: row.color, width: row.width, points: row.points as any }, w, h);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
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

  // 入力イベント
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onDown = (ev: PointerEvent) => {
      ev.preventDefault();
      (ev.target as any)?.setPointerCapture?.(ev.pointerId);

      const p = getNormPoint(ev);
      if (!p) return;

      drawingRef.current = true;
      pointsRef.current = [p];
      lastPtRef.current = p;

      // 最初の一回でAudioを起こしつつ鳴らす
      sounds.chalkTick(1);
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

      // 速度に応じて音量変化（雑でOK）
      const intensity = Math.min(1.2, Math.max(0.4, Math.sqrt(dist2) * 40));
      sounds.chalkTick(intensity);
    };

    const onUp = async (ev: PointerEvent) => {
      if (!drawingRef.current) return;
      ev.preventDefault();
      drawingRef.current = false;

      sounds.stopNoise();

      const pts = pointsRef.current;
      pointsRef.current = [];
      lastPtRef.current = null;

      if (!pts || pts.length < 2) return;

      const { error } = await supabase.from("call_chalk_strokes").insert({
        session_id: sessionId,
        device_id: deviceIdRef.current,
        display_name: displayNameRef.current || "You",
        color: penColor,
        width: penWidth,
        points: pts,
        kind: "stroke",
      });

      if (error) setInfo(`送信失敗: ${error.message}`);
      else setInfo("");
    };

    const onDbl = (ev: MouseEvent) => {
      ev.preventDefault();
      // 黒板コンコン（強さは適当に）
      sounds.konkon(1);
    };

    canvas.addEventListener("pointerdown", onDown, { passive: false });
    canvas.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp, { passive: false });
    canvas.addEventListener("dblclick", onDbl, { passive: false });

    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("dblclick", onDbl);
      sounds.stopNoise();
    };
  }, [sessionId, penColor, penWidth]);

  const onClear = async () => {
    clearLocal();
    const { error } = await supabase.from("call_chalk_strokes").insert({
      session_id: sessionId,
      device_id: deviceIdRef.current,
      display_name: displayNameRef.current || "You",
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
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 900 }}>黒板（ペン対応・共有）</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>
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

          <label style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>
            色
            <input
              type="color"
              value={penColor}
              onChange={(e) => setPenColor(e.target.value)}
              style={{ marginLeft: 8, width: 34, height: 28, border: "none", background: "transparent" }}
            />
          </label>

          <button
            onClick={() => sounds.konkon(1)}
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              border: "1px solid #ddd",
              background: "#fff",
              color: "#111",
              fontWeight: 900,
              cursor: "pointer",
            }}
            title="黒板をコンコン"
          >
            コンコン
          </button>

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
          height: 360,
          borderRadius: 16,
          border: "2px solid #073126",
          background: "#0b3b2e",
          boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.06)",
          overflow: "hidden",
          touchAction: "none",
        }}
      >
        <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
      </div>

      <div style={{ marginTop: 8, fontSize: 11, color: "#6b7280", fontWeight: 900 }}>
        ※ タッチペン/指で書けます。みんなの線はリアルタイムで反映されます。（ダブルクリックでコンコン）
        {info ? `（${info}）` : ""}
      </div>
    </div>
  );
}

export default function CallClient() {
  const router = useRouter();

  const [sessionId, setSessionId] = useState<string>("");
  const [returnTo, setReturnTo] = useState<string>("/class/select");

  const [status, setStatus] = useState<"forming" | "active" | "closed">("forming");
  const [capacity, setCapacity] = useState(5);
  const [memberCount, setMemberCount] = useState(0);
  const [members, setMembers] = useState<{ display_name: string; joined_at: string }[]>([]);
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

  // ✅ 通話でも参加を記録（memberCount 0対策）
  useEffect(() => {
    if (!sessionId) return;

    const name =
      localStorage.getItem("classmate_display_name") ||
      localStorage.getItem("display_name") ||
      "You";

    // ★ join API は { sessionId, name } を見る（displayNameではない）
    fetch("/api/session/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, name }),
    }).catch(() => {});
  }, [sessionId]);

  async function fetchStatus(sid: string) {
    try {
      const res = await fetch(`/api/session/status?sessionId=${encodeURIComponent(sid)}`, { cache: "no-store" });
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

  // ✅ ポーリングは軽め（通話中にログを増やさない）
  useEffect(() => {
    if (!sessionId) return;
    fetchStatus(sessionId);
    if (pollTimer.current) window.clearInterval(pollTimer.current);
    pollTimer.current = window.setInterval(() => fetchStatus(sessionId), 5000);
    return () => {
      if (pollTimer.current) window.clearInterval(pollTimer.current);
      pollTimer.current = null;
    };
  }, [sessionId]);

  // マイク取得
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!sessionId) return;
      if (localStreamRef.current) return;

      try {
        setMicReady(false);
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
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
  }, [sessionId]);

  const names = useMemo(() => (members ?? []).map((m) => m.display_name).filter(Boolean), [members]);
  const filled = Math.min(names.length > 0 ? names.length : memberCount, capacity);

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
          <div style={{ padding: 10, border: "1px solid #f5c2c7", background: "#f8d7da", borderRadius: 10, color: "#842029" }}>
            <p style={{ margin: 0, fontWeight: 900 }}>エラー</p>
            <p style={{ margin: "6px 0 0 0" }}>{err}</p>
          </div>
        ) : null}

        <div style={{ border: "1px solid #ddd", borderRadius: 14, padding: 12, background: "#fff" }}>
          <div style={{ fontWeight: 900 }}>クラス</div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
            参加者：<b>{memberCount}</b> / {capacity} ・ 状態：
            {status === "active" ? "通話中" : status === "closed" ? "終了" : "待機"} ・ マイク：
            {micReady ? micStateLabel : "未許可/準備中"}
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {Array.from({ length: capacity }).map((_, i) => {
              const isFilled = i < filled;
              const name = names[i] ?? (isFilled ? "参加者" : "未参加");
              return <AvatarChip key={i} name={name} filled={isFilled} />;
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
