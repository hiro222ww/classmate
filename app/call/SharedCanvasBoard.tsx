"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getDeviceId } from "@/lib/device";

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

type SharedCanvasBoardProps = {
  sessionId: string;
};

type BroadcastStrokePayload = {
  sessionId: string;
  deviceId: string;
  strokeId: string;
  color: string;
  width: number;
  points: StrokePoint[];
  done?: boolean;
};

type BroadcastClearPayload = {
  sessionId: string;
  deviceId: string;
  clearAt: number;
};

function sanitizeDisplayName(v: string | null | undefined) {
  const s = String(v ?? "").trim();
  if (!s || s === "You") return "参加者";
  return s;
}

function makeStrokeId() {
  return `stroke_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

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
  ctx.lineWidth = Math.max(1, stroke.width || 3);

  if (pts.length === 1) {
    const p = pts[0];
    ctx.beginPath();
    ctx.arc(
      p.x * canvasW,
      p.y * canvasH,
      Math.max(1, (stroke.width || 3) / 2),
      0,
      Math.PI * 2
    );
    ctx.fillStyle = stroke.color || "#ffffff";
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(pts[0].x * canvasW, pts[0].y * canvasH);

  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x * canvasW, pts[i].y * canvasH);
  }

  ctx.stroke();
  ctx.restore();
}

function useBoardSounds() {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);

  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const chalkGainRef = useRef<GainNode | null>(null);
  const bpRef = useRef<BiquadFilterNode | null>(null);
  const hpRef = useRef<BiquadFilterNode | null>(null);
  const lpRef = useRef<BiquadFilterNode | null>(null);

  const lfoRef = useRef<OscillatorNode | null>(null);
  const lfoGainRef = useRef<GainNode | null>(null);

  const bodyOscRef = useRef<OscillatorNode | null>(null);
  const bodyGainRef = useRef<GainNode | null>(null);

  const ensure = () => {
    if (ctxRef.current) return;

    const Ctx = (window.AudioContext ||
      (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!Ctx) return;

    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = 0.92;
    master.connect(ctx.destination);

    ctxRef.current = ctx;
    masterRef.current = master;
  };

  const resumeIfNeeded = () => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
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

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.48;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 620;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2400;
    bp.Q.value = 1.2;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 9000;

    const chalkGain = ctx.createGain();
    chalkGain.gain.value = 0.0;

    const lfo = ctx.createOscillator();
    lfo.type = "triangle";
    lfo.frequency.value = 17;

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.1;

    const bodyOsc = ctx.createOscillator();
    bodyOsc.type = "sine";
    bodyOsc.frequency.value = 185;

    const bodyGain = ctx.createGain();
    bodyGain.gain.value = 0.0;

    lfo.connect(lfoGain);
    lfoGain.connect(chalkGain.gain);

    src.connect(hp);
    hp.connect(bp);
    bp.connect(lp);
    lp.connect(chalkGain);
    chalkGain.connect(master);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(master);

    src.start();
    lfo.start();
    bodyOsc.start();

    srcRef.current = src;
    chalkGainRef.current = chalkGain;
    bpRef.current = bp;
    hpRef.current = hp;
    lpRef.current = lp;
    lfoRef.current = lfo;
    lfoGainRef.current = lfoGain;
    bodyOscRef.current = bodyOsc;
    bodyGainRef.current = bodyGain;
  };

  const dispose = () => {
    try {
      srcRef.current?.stop();
    } catch {}
    try {
      lfoRef.current?.stop();
    } catch {}
    try {
      bodyOscRef.current?.stop();
    } catch {}

    try {
      srcRef.current?.disconnect();
    } catch {}
    try {
      lfoRef.current?.disconnect();
    } catch {}
    try {
      bodyOscRef.current?.disconnect();
    } catch {}
    try {
      chalkGainRef.current?.disconnect();
    } catch {}
    try {
      bpRef.current?.disconnect();
    } catch {}
    try {
      hpRef.current?.disconnect();
    } catch {}
    try {
      lpRef.current?.disconnect();
    } catch {}
    try {
      lfoGainRef.current?.disconnect();
    } catch {}
    try {
      bodyGainRef.current?.disconnect();
    } catch {}

    srcRef.current = null;
    lfoRef.current = null;
    bodyOscRef.current = null;
    chalkGainRef.current = null;
    bpRef.current = null;
    hpRef.current = null;
    lpRef.current = null;
    lfoGainRef.current = null;
    bodyGainRef.current = null;

    const ctx = ctxRef.current;
    ctxRef.current = null;
    masterRef.current = null;

    try {
      void ctx?.close();
    } catch {}
  };

  const chalkStart = () => {
    startIfNeeded();

    const ctx = ctxRef.current;
    const g = chalkGainRef.current;
    const body = bodyGainRef.current;
    if (!ctx || !g || !body) return;

    const t = ctx.currentTime;

    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.setTargetAtTime(0.028, t, 0.018);

    body.gain.cancelScheduledValues(t);
    body.gain.setValueAtTime(body.gain.value, t);
    body.gain.setTargetAtTime(0.006, t, 0.03);
  };

  const chalkMove = (speed01: number, pressure01: number) => {
    startIfNeeded();

    const ctx = ctxRef.current;
    const g = chalkGainRef.current;
    const bp = bpRef.current;
    const hp = hpRef.current;
    const lp = lpRef.current;
    const lfoG = lfoGainRef.current;
    const body = bodyGainRef.current;

    if (!ctx || !g || !bp || !hp || !lp || !lfoG || !body) return;

    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    const s = clamp01(speed01);
    const p = clamp01(pressure01);
    const jitter = 0.92 + Math.random() * 0.16;

    const amp = 0.012 + 0.06 * s + 0.12 * p;
    const center = (1900 + 2900 * s - 850 * p) * jitter;
    const hpFreq = 500 + 450 * s;
    const lpFreq = 7000 + 2200 * (1 - p);
    const gateDepth = 0.06 + 0.28 * p + 0.08 * (1 - s);
    const bodyAmp = 0.002 + 0.014 * p + 0.004 * (1 - s);
    const t = ctx.currentTime;

    bp.frequency.setTargetAtTime(center, t, 0.02);
    bp.Q.setTargetAtTime(0.8 + 1.8 * p, t, 0.03);
    hp.frequency.setTargetAtTime(hpFreq, t, 0.03);
    lp.frequency.setTargetAtTime(lpFreq, t, 0.03);
    lfoG.gain.setTargetAtTime(gateDepth, t, 0.04);
    g.gain.setTargetAtTime(amp, t, 0.018);
    body.gain.setTargetAtTime(bodyAmp, t, 0.04);
  };

  const chalkEnd = () => {
    const ctx = ctxRef.current;
    const g = chalkGainRef.current;
    const body = bodyGainRef.current;
    if (!ctx || !g || !body) return;

    const t = ctx.currentTime;

    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.setTargetAtTime(0.0, t, 0.035);

    body.gain.cancelScheduledValues(t);
    body.gain.setValueAtTime(body.gain.value, t);
    body.gain.setTargetAtTime(0.0, t, 0.05);
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
    g1.gain.exponentialRampToValueAtTime(0.16 * strength, t0 + 0.01);
    g1.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
    o1.connect(g1);
    g1.connect(master);

    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    o2.type = "triangle";
    o2.frequency.setValueAtTime(1200, t0);
    g2.gain.setValueAtTime(0.0001, t0);
    g2.gain.exponentialRampToValueAtTime(0.045 * strength, t0 + 0.005);
    g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.03);
    o2.connect(g2);
    g2.connect(master);

    const noiseBuf = ctx.createBuffer(
      1,
      Math.floor(ctx.sampleRate * 0.02),
      ctx.sampleRate
    );
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) {
      ch[i] = (Math.random() * 2 - 1) * 0.25;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;

    const ng = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 900;

    ng.gain.setValueAtTime(0.0001, t0);
    ng.gain.exponentialRampToValueAtTime(0.028 * strength, t0 + 0.003);
    ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.025);

    noise.connect(hp);
    hp.connect(ng);
    ng.connect(master);

    o1.start(t0);
    o2.start(t0);
    noise.start(t0);

    o1.stop(t0 + 0.11);
    o2.stop(t0 + 0.04);
    noise.stop(t0 + 0.025);
  };

  return useMemo(
    () => ({
      chalkStart,
      chalkMove,
      chalkEnd,
      konkon,
      dispose,
    }),
    []
  );
}

function SharedCanvasBoard({ sessionId }: SharedCanvasBoardProps) {
  const deviceIdRef = useRef("");
  const displayNameRef = useRef("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const drawingRef = useRef(false);
  const pointsRef = useRef<StrokePoint[]>([]);
  const lastPtRef = useRef<StrokePoint | null>(null);
  const strokeIdRef = useRef("");

  const lastMoveRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const lastKonkonRef = useRef(0);

  const watchdogRef = useRef<number | null>(null);
  const lastInputAtRef = useRef(0);

  const remoteProgressRef = useRef<Record<string, StrokePoint[]>>({});
  const remoteStyleRef = useRef<Record<string, { color: string; width: number }>>(
    {}
  );
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const [penWidth, setPenWidth] = useState(3);
  const [penColor, setPenColor] = useState("#ffffff");
  const [info, setInfo] = useState("");

  const sounds = useBoardSounds();

  useEffect(() => {
    deviceIdRef.current = getDeviceId();

    try {
      const did = deviceIdRef.current;
      const scoped = did ? `classmate_display_name:${did}` : "classmate_display_name";
      const legacyScoped = did ? `display_name:${did}` : "display_name";

      displayNameRef.current = sanitizeDisplayName(
        localStorage.getItem(scoped) ||
          localStorage.getItem(legacyScoped) ||
          localStorage.getItem("classmate_display_name") ||
          localStorage.getItem("display_name") ||
          "参加者"
      );
    } catch {
      displayNameRef.current = "参加者";
    }
  }, []);

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const rect = wrap.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width));
    const h = Math.max(280, Math.floor(rect.height));

    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const getCanvasSize = () => {
    const canvas = canvasRef.current;
    if (!canvas) return { w: 0, h: 0 };

    return {
      w: canvas.width,
      h: canvas.height,
    };
  };

  const paintBoardBase = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { w, h } = getCanvasSize();
    if (w <= 0 || h <= 0) return;

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0b3b2e";
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  };

  const clearLocal = () => {
    paintBoardBase();
    remoteProgressRef.current = {};
    remoteStyleRef.current = {};
  };

  const redrawFromRows = (rows: ChalkStrokeRow[]) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const { w, h } = getCanvasSize();
    if (w <= 0 || h <= 0) return;

    paintBoardBase();

    for (const row of rows) {
      if (row.kind === "clear") {
        paintBoardBase();
        continue;
      }

      drawStroke(
        ctx,
        { color: row.color, width: row.width, points: row.points ?? [] },
        w,
        h
      );
    }

    for (const key of Object.keys(remoteProgressRef.current)) {
      const pts = remoteProgressRef.current[key];
      const style = remoteStyleRef.current[key];
      if (pts && pts.length >= 2) {
        drawStroke(
          ctx,
          {
            color: style?.color ?? "#ffffff",
            width: style?.width ?? 3,
            points: pts,
          },
          w,
          h
        );
      }
    }

    if (drawingRef.current && pointsRef.current.length >= 2) {
      drawStroke(
        ctx,
        {
          color: penColor,
          width: penWidth,
          points: pointsRef.current,
        },
        w,
        h
      );
    }
  };

  const loadAll = async () => {
    if (drawingRef.current) return;

    const { data, error } = await supabase
      .from("call_chalk_strokes")
      .select(
        "id, session_id, device_id, display_name, color, width, points, kind, created_at"
      )
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(1000);

    if (error) {
      setInfo(`黒板ロード失敗: ${error.message}`);
      return;
    }

    redrawFromRows((data ?? []) as ChalkStrokeRow[]);
    setInfo("");
  };

  const sendBroadcastStroke = async (payload: BroadcastStrokePayload) => {
    if (!channelRef.current) return;

    await channelRef.current.send({
      type: "broadcast",
      event: "chalk_move",
      payload,
    });
  };

  const sendBroadcastClear = async (payload: BroadcastClearPayload) => {
    if (!channelRef.current) return;

    await channelRef.current.send({
      type: "broadcast",
      event: "chalk_clear",
      payload,
    });
  };

  useEffect(() => {
    if (!sessionId) return;

    const ch = supabase
      .channel(`chalk_live:${sessionId}`, {
        config: {
          broadcast: { self: false },
        },
      })
      .on("broadcast", { event: "chalk_move" }, ({ payload }) => {
        const p = payload as BroadcastStrokePayload;
        if (!p || p.sessionId !== sessionId) return;
        if (p.deviceId === deviceIdRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;

        const { w, h } = getCanvasSize();
        if (w <= 0 || h <= 0) return;

        const key = `${p.deviceId}:${p.strokeId}`;
        const prev = remoteProgressRef.current[key] ?? [];

        if (p.done) {
          delete remoteProgressRef.current[key];
          delete remoteStyleRef.current[key];
          return;
        }

        if (!p.points || p.points.length < 2) return;

        const merged = [...prev, ...p.points];
        remoteProgressRef.current[key] = merged;
        remoteStyleRef.current[key] = {
          color: p.color,
          width: p.width,
        };

        drawStroke(
          ctx,
          {
            color: p.color,
            width: p.width,
            points: p.points,
          },
          w,
          h
        );
      })
      .on("broadcast", { event: "chalk_clear" }, ({ payload }) => {
        const p = payload as BroadcastClearPayload;
        if (!p || p.sessionId !== sessionId) return;
        if (p.deviceId === deviceIdRef.current) return;
        clearLocal();
      })
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

          const { w, h } = getCanvasSize();
          if (w <= 0 || h <= 0) return;

          if (row.kind === "clear") {
            clearLocal();
            return;
          }

          drawStroke(
            ctx,
            { color: row.color, width: row.width, points: row.points ?? [] },
            w,
            h
          );
        }
      );

    ch.subscribe();
    channelRef.current = ch;

    return () => {
      channelRef.current = null;
      void supabase.removeChannel(ch);
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    const boot = async () => {
      setInfo("");
      resizeCanvas();
      paintBoardBase();
      await loadAll();
    };

    void boot();
  }, [sessionId]);

  useEffect(() => {
    const onResize = () => {
      void (async () => {
        resizeCanvas();
        await loadAll();
      })();
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    const timer = window.setInterval(() => {
      if (drawingRef.current) return;
      void loadAll();
    }, 5000);

    return () => {
      window.clearInterval(timer);
    };
  }, [sessionId]);

  const getNormPoint = (e: PointerEvent): StrokePoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    return {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    };
  };

  const drawLocalSegment = (from: StrokePoint, to: StrokePoint) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const { w, h } = getCanvasSize();
    if (w <= 0 || h <= 0) return;

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

  const persistWholeStroke = async (pts: StrokePoint[]) => {
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

    if (error) {
      setInfo(`保存失敗: ${error.message}`);
    } else {
      setInfo("");
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const forceEnd = () => {
      drawingRef.current = false;
      lastMoveRef.current = null;
      lastPtRef.current = null;
      pointsRef.current = [];
      strokeIdRef.current = "";
      sounds.dispose();
    };

    const finalizeAndSend = async () => {
      drawingRef.current = false;
      lastMoveRef.current = null;

      const finalPoints = [...pointsRef.current];

      if (finalPoints.length >= 2) {
        await sendBroadcastStroke({
          sessionId,
          deviceId: deviceIdRef.current,
          strokeId: strokeIdRef.current,
          color: penColor,
          width: penWidth,
          points: finalPoints,
          done: true,
        });

        await persistWholeStroke(finalPoints);
      }

      pointsRef.current = [];
      lastPtRef.current = null;
      strokeIdRef.current = "";

      sounds.chalkEnd();
      sounds.dispose();
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
      strokeIdRef.current = makeStrokeId();

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

      void sendBroadcastStroke({
        sessionId,
        deviceId: deviceIdRef.current,
        strokeId: strokeIdRef.current,
        color: penColor,
        width: penWidth,
        points: [last, p],
        done: false,
      }).catch((e: any) => {
        setInfo(e?.message ?? "broadcast_failed");
      });

      const prev = lastMoveRef.current;
      const now = performance.now();

      if (prev) {
        const { w, h } = getCanvasSize();
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
  }, [sessionId, penColor, penWidth, sounds]);

  const onClear = async () => {
    clearLocal();

    await sendBroadcastClear({
      sessionId,
      deviceId: deviceIdRef.current,
      clearAt: Date.now(),
    });

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
        <div style={{ fontWeight: 900 }}>黒板（通話中のみ）</div>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <label style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>
            太さ
            <input
              type="range"
              min={1}
              max={10}
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
          marginLeft: -12,
          marginRight: -12,
          width: "calc(100% + 24px)",
          height: 480,
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
        ※ 描画中は broadcast、履歴復元は DB を使います。
        {info ? `（${info}）` : ""}
      </div>
    </div>
  );
}

export default SharedCanvasBoard;