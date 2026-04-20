"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
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

const CHALK_COLORS = [
  { name: "白", value: "#ffffff" },
  { name: "蛍光黄", value: "#fff44f" },
  { name: "蛍光ピンク", value: "#ff5ccf" },
  { name: "蛍光オレンジ", value: "#ff9f1c" },
  { name: "蛍光緑", value: "#39ff14" },
  { name: "蛍光青", value: "#4cc9f0" },
] as const;

const BOARD_BG = "#0b3b2e";
const BOARD_OUTER_BG = "#08271e";
const ERASER_WIDTH = 28;

/**
 * 実際に描ける気持ちよさを優先して、
 * 横だけでなく高さも増やして窮屈さを減らす。
 */
const BOARD_LOGICAL_WIDTH = 2200;
const BOARD_LOGICAL_HEIGHT = 1100;

/**
 * モバイルでも横スクロールで広く使えるようにする。
 * PCではかなり大きく表示されるように、最小表示幅も広げる。
 */
const MOBILE_MIN_BOARD_WIDTH_PX = 1200;

function sanitizeDisplayName(v: string | null | undefined) {
  const s = String(v ?? "").trim();
  if (!s || s === "You") return "参加者";
  return s;
}

function makeStrokeId() {
  return `stroke_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function makeLocalRowId(prefix: string) {
  return `local-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function applyStrokeStyle(
  ctx: CanvasRenderingContext2D,
  color: string,
  width: number
) {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.miterLimit = 1;
  ctx.strokeStyle = color || "#ffffff";
  ctx.lineWidth = Math.max(1, width || 3);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: { color: string; width: number; points: StrokePoint[] },
  canvasW: number,
  canvasH: number
) {
  const pts = stroke.points;
  if (!pts || pts.length === 0) return;

  const mapX = (x: number) => (x / BOARD_LOGICAL_WIDTH) * canvasW;
  const mapY = (y: number) => (y / BOARD_LOGICAL_HEIGHT) * canvasH;

  ctx.save();
  applyStrokeStyle(ctx, stroke.color || "#ffffff", stroke.width || 3);

  if (pts.length === 1) {
    const p = pts[0];
    ctx.beginPath();
    ctx.arc(
      mapX(p.x),
      mapY(p.y),
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
  ctx.moveTo(mapX(pts[0].x), mapY(pts[0].y));

  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(mapX(pts[i].x), mapY(pts[i].y));
  }

  ctx.stroke();
  ctx.restore();
}

function upsertRows(base: ChalkStrokeRow[], incoming: ChalkStrokeRow[]) {
  const map = new Map<string, ChalkStrokeRow>();

  for (const row of base) map.set(row.id, row);
  for (const row of incoming) map.set(row.id, row);

  return Array.from(map.values()).sort((a, b) =>
    String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""))
  );
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

    const amp = 0.016 + 0.08 * s + 0.14 * p;
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
  const boardSurfaceRef = useRef<HTMLDivElement | null>(null);

  const drawingRef = useRef(false);
  const pointsRef = useRef<StrokePoint[]>([]);
  const lastPtRef = useRef<StrokePoint | null>(null);
  const strokeIdRef = useRef("");

  const lastMoveRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const lastKonkonRef = useRef(0);

  const watchdogRef = useRef<number | null>(null);

  const remoteProgressRef = useRef<Record<string, StrokePoint[]>>({});
  const remoteStyleRef = useRef<Record<string, { color: string; width: number }>>(
    {}
  );
  const remoteStrokeQueueByDeviceRef = useRef<Record<string, string[]>>({});
  const channelRef = useRef<ReturnType<typeof supabaseBrowser.channel> | null>(null);

  const persistedRowsRef = useRef<ChalkStrokeRow[]>([]);
  const pendingRowsRef = useRef<ChalkStrokeRow[]>([]);

  const strokeColorRef = useRef<string>(CHALK_COLORS[0].value);
  const strokeWidthRef = useRef<number>(3);

  const [penWidth, setPenWidth] = useState<number>(3);
  const [penColor, setPenColor] = useState<string>(CHALK_COLORS[0].value);
  const [tool, setTool] = useState<"chalk" | "eraser">("chalk");
  const [info, setInfo] = useState("");
  const [isTouchLike, setIsTouchLike] = useState(false);
  const [touchMode, setTouchMode] = useState<"draw" | "pan">("draw");

  const sounds = useBoardSounds();

  useEffect(() => {
    deviceIdRef.current = getDeviceId();

    try {
      const did = deviceIdRef.current;
      const scoped = did ? `classmate_display_name:${did}` : "";
      const legacyScoped = did ? `display_name:${did}` : "";

      displayNameRef.current = sanitizeDisplayName(
        (scoped && localStorage.getItem(scoped)) ||
          (legacyScoped && localStorage.getItem(legacyScoped)) ||
          "参加者"
      );
    } catch {
      displayNameRef.current = "参加者";
    }

    const touch =
      typeof window !== "undefined" &&
      ("ontouchstart" in window || navigator.maxTouchPoints > 0);

    setIsTouchLike(touch);

    console.log("[chalk] mount", {
      sessionId,
      deviceId: deviceIdRef.current,
      displayName: displayNameRef.current,
      href: typeof window !== "undefined" ? window.location.href : "",
      touch,
    });
  }, [sessionId]);

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    const boardSurface = boardSurfaceRef.current;
    if (!canvas || !boardSurface) return;

    const rect = boardSurface.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width));
    const h = Math.max(240, Math.floor(rect.height));

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
    return { w: canvas.width, h: canvas.height };
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
    ctx.fillStyle = BOARD_BG;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  };

  const clearRemoteOnly = () => {
    remoteProgressRef.current = {};
    remoteStyleRef.current = {};
    remoteStrokeQueueByDeviceRef.current = {};
  };

  const redrawScene = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const { w, h } = getCanvasSize();
    if (w <= 0 || h <= 0) return;

    paintBoardBase();

    const mergedRows = upsertRows(
      persistedRowsRef.current,
      pendingRowsRef.current
    );

    for (const row of mergedRows) {
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
      if (pts && pts.length >= 1) {
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

    if (drawingRef.current && pointsRef.current.length >= 1) {
      drawStroke(
        ctx,
        {
          color: strokeColorRef.current,
          width: strokeWidthRef.current,
          points: pointsRef.current,
        },
        w,
        h
      );
    }
  };

  const loadAll = async () => {
    console.log("[chalk] loadAll start", { sessionId });

    const { data, error } = await supabaseBrowser
      .from("call_chalk_strokes")
      .select(
        "id, session_id, device_id, display_name, color, width, points, kind, created_at"
      )
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[chalk] loadAll failed", {
        sessionId,
        message: error.message,
      });
      setInfo(`黒板ロード失敗: ${error.message}`);
      return;
    }

    const incoming = (data ?? []) as ChalkStrokeRow[];
    console.log("[chalk] loadAll success", {
      sessionId,
      rows: incoming.length,
    });

    persistedRowsRef.current = upsertRows(persistedRowsRef.current, incoming);
    redrawScene();
    setInfo("");
  };

  const sendBroadcastStroke = async (payload: BroadcastStrokePayload) => {
    if (!channelRef.current) {
      console.warn("[chalk] send skipped: no channel", payload);
      return;
    }

    const result = await channelRef.current.send({
      type: "broadcast",
      event: "chalk_move",
      payload,
    });

    console.log("[chalk] send chalk_move", {
      result,
      sessionId: payload.sessionId,
      strokeId: payload.strokeId,
      done: payload.done,
      points: payload.points.length,
    });

    return result;
  };

  const sendBroadcastClear = async (payload: BroadcastClearPayload) => {
    if (!channelRef.current) {
      console.warn("[chalk] clear skipped: no channel", payload);
      return;
    }

    const result = await channelRef.current.send({
      type: "broadcast",
      event: "chalk_clear",
      payload,
    });

    console.log("[chalk] send chalk_clear", {
      result,
      sessionId: payload.sessionId,
      clearAt: payload.clearAt,
    });

    return result;
  };

  useEffect(() => {
    if (!sessionId) return;

    const ch = supabaseBrowser
      .channel(`chalk_live:${sessionId}`, {
        config: {
          broadcast: { self: false },
        },
      })
      .on("broadcast", { event: "chalk_move" }, ({ payload }) => {
        const p = payload as BroadcastStrokePayload;
        console.log("[chalk] recv chalk_move", p);

        if (!p || p.sessionId !== sessionId) return;
        if (p.deviceId === deviceIdRef.current) return;

        const key = `${p.deviceId}:${p.strokeId}`;

        if (p.done) {
          // DB INSERT で正式反映されるまでここでは消さない
          return;
        }

        if (!p.points || p.points.length < 1) return;

        const prev = remoteProgressRef.current[key] ?? [];
        const nextPoints = [...prev];

        if (nextPoints.length === 0) {
          nextPoints.push(...p.points);

          const queue = remoteStrokeQueueByDeviceRef.current[p.deviceId] ?? [];
          if (!queue.includes(key)) {
            queue.push(key);
            remoteStrokeQueueByDeviceRef.current[p.deviceId] = queue;
          }
        } else {
          const tail = p.points[p.points.length - 1];
          const last = nextPoints[nextPoints.length - 1];
          if (!last || last.x !== tail.x || last.y !== tail.y) {
            nextPoints.push(tail);
          }
        }

        remoteProgressRef.current[key] = nextPoints;
        remoteStyleRef.current[key] = {
          color: p.color,
          width: p.width,
        };

        redrawScene();
      })
      .on("broadcast", { event: "chalk_clear" }, ({ payload }) => {
        const p = payload as BroadcastClearPayload;
        console.log("[chalk] recv chalk_clear", p);

        if (!p || p.sessionId !== sessionId) return;
        if (p.deviceId === deviceIdRef.current) return;

        clearRemoteOnly();
        redrawScene();
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
          console.log("[chalk] postgres INSERT", row);

          if (!row?.id) return;

          if (row.kind === "clear") {
            persistedRowsRef.current = upsertRows(persistedRowsRef.current, [row]);
            clearRemoteOnly();
            redrawScene();
            return;
          }

          persistedRowsRef.current = upsertRows(persistedRowsRef.current, [row]);

          const deviceId = String(row.device_id ?? "").trim();
          const queue = remoteStrokeQueueByDeviceRef.current[deviceId] ?? [];
          const targetKey = queue.shift();

          if (targetKey) {
            delete remoteProgressRef.current[targetKey];
            delete remoteStyleRef.current[targetKey];
          }

          remoteStrokeQueueByDeviceRef.current[deviceId] = queue;
          redrawScene();
        }
      );

    ch.subscribe((status) => {
      console.log("[chalk] subscribe status", {
        sessionId,
        status,
      });

      if (status === "CHANNEL_ERROR") {
        setInfo("黒板Realtime接続失敗");
      } else if (status === "TIMED_OUT") {
        setInfo("黒板Realtimeタイムアウト");
      } else if (status === "SUBSCRIBED") {
        setInfo("");
        if (!drawingRef.current) {
          void loadAll();
        }
      }
    });

    channelRef.current = ch;

    return () => {
      console.log("[chalk] cleanup channel", { sessionId });
      channelRef.current = null;
      void supabaseBrowser.removeChannel(ch);
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
      resizeCanvas();
      redrawScene();
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [sessionId]);

  useEffect(() => {
    const onFocus = () => {
      if (!drawingRef.current) {
        void loadAll();
      }
    };

    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [sessionId]);

  const getBoardPoint = (e: PointerEvent): StrokePoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
      return null;
    }

    return {
      x: (x / rect.width) * BOARD_LOGICAL_WIDTH,
      y: (y / rect.height) * BOARD_LOGICAL_HEIGHT,
    };
  };

  const drawLocalSegment = (from: StrokePoint, to: StrokePoint) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const { w, h } = getCanvasSize();
    if (w <= 0 || h <= 0) return;

    const mapX = (x: number) => (x / BOARD_LOGICAL_WIDTH) * w;
    const mapY = (y: number) => (y / BOARD_LOGICAL_HEIGHT) * h;

    const strokeColor = strokeColorRef.current;
    const strokeWidth = strokeWidthRef.current;

    ctx.save();
    applyStrokeStyle(ctx, strokeColor, strokeWidth);

    if (from.x === to.x && from.y === to.y) {
      ctx.beginPath();
      ctx.arc(
        mapX(to.x),
        mapY(to.y),
        Math.max(1, strokeWidth / 2),
        0,
        Math.PI * 2
      );
      ctx.fillStyle = strokeColor;
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(mapX(from.x), mapY(from.y));
    ctx.lineTo(mapX(to.x), mapY(to.y));
    ctx.stroke();
    ctx.restore();
  };

  const persistWholeStroke = async (pts: StrokePoint[]) => {
    if (!pts || pts.length < 1) return;

    const safeName = sanitizeDisplayName(displayNameRef.current);

    const localCommittedRow: ChalkStrokeRow = {
      id: makeLocalRowId("local-commit"),
      session_id: sessionId,
      device_id: deviceIdRef.current,
      display_name: safeName,
      color: strokeColorRef.current,
      width: strokeWidthRef.current,
      points: pts,
      kind: "stroke",
      created_at: new Date().toISOString(),
    };

    const optimisticRow: ChalkStrokeRow = {
      id: makeLocalRowId("stroke"),
      session_id: sessionId,
      device_id: deviceIdRef.current,
      display_name: safeName,
      color: strokeColorRef.current,
      width: strokeWidthRef.current,
      points: pts,
      kind: "stroke",
      created_at: new Date().toISOString(),
    };

    persistedRowsRef.current = upsertRows(persistedRowsRef.current, [localCommittedRow]);
    pendingRowsRef.current = upsertRows(pendingRowsRef.current, [optimisticRow]);
    redrawScene();

    const { data, error } = await supabaseBrowser
      .from("call_chalk_strokes")
      .insert({
        session_id: sessionId,
        device_id: deviceIdRef.current,
        display_name: safeName,
        color: strokeColorRef.current,
        width: strokeWidthRef.current,
        points: pts,
        kind: "stroke",
      })
      .select(
        "id, session_id, device_id, display_name, color, width, points, kind, created_at"
      )
      .single();

    if (error) {
      console.error("[chalk] persist stroke failed", {
        sessionId,
        message: error.message,
        pointCount: pts.length,
      });
      setInfo(`保存失敗: ${error.message}`);

      pendingRowsRef.current = pendingRowsRef.current.filter(
        (row) => row.id !== optimisticRow.id
      );
      redrawScene();
      return;
    }

    if (data) {
      console.log("[chalk] persist stroke success", {
        sessionId,
        id: data.id,
        pointCount: pts.length,
      });

      persistedRowsRef.current = upsertRows(persistedRowsRef.current, [
        data as ChalkStrokeRow,
      ]);

      persistedRowsRef.current = persistedRowsRef.current.filter(
        (row) => row.id !== localCommittedRow.id
      );
    }

    pendingRowsRef.current = pendingRowsRef.current.filter(
      (row) => row.id !== optimisticRow.id
    );

    redrawScene();
    setInfo("");
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resetDrawingState = () => {
      drawingRef.current = false;
      lastMoveRef.current = null;
      lastPtRef.current = null;
      pointsRef.current = [];
      strokeIdRef.current = "";
    };

    const forceAbort = () => {
      resetDrawingState();
      sounds.chalkEnd();
      sounds.dispose();
    };

    const finalizeAndSend = async () => {
      if (!drawingRef.current) {
        forceAbort();
        return;
      }

      const finalPoints = [...pointsRef.current];
      const strokeColor = strokeColorRef.current;
      const strokeWidth = strokeWidthRef.current;
      const finalStrokeId = strokeIdRef.current;

      resetDrawingState();

      if (finalPoints.length >= 1) {
        await sendBroadcastStroke({
          sessionId,
          deviceId: deviceIdRef.current,
          strokeId: finalStrokeId,
          color: strokeColor,
          width: strokeWidth,
          points: finalPoints,
          done: true,
        });

        await persistWholeStroke(finalPoints);
      }

      sounds.chalkEnd();
      sounds.dispose();
    };

    const onDown = (ev: PointerEvent) => {
      if (window.getSelection) {
        const sel = window.getSelection();
        if (sel && sel.removeAllRanges) sel.removeAllRanges();
      }

      if (isTouchLike && touchMode === "pan") return;

      ev.preventDefault();
      (ev.target as any)?.setPointerCapture?.(ev.pointerId);

      const p = getBoardPoint(ev);
      if (!p) return;

      strokeColorRef.current = tool === "eraser" ? BOARD_BG : penColor;
      strokeWidthRef.current = tool === "eraser" ? ERASER_WIDTH : penWidth;

      drawingRef.current = true;
      pointsRef.current = [p];
      lastPtRef.current = p;
      lastMoveRef.current = { t: performance.now(), x: p.x, y: p.y };
      strokeIdRef.current = makeStrokeId();

      redrawScene();

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

      const p = getBoardPoint(ev);
      const last = lastPtRef.current;
      if (!p || !last) return;

      const dx = p.x - last.x;
      const dy = p.y - last.y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 < 0.8) return;

      pointsRef.current.push(p);
      drawLocalSegment(last, p);
      lastPtRef.current = p;

      const strokeColor = strokeColorRef.current;
      const strokeWidth = strokeWidthRef.current;

      void sendBroadcastStroke({
        sessionId,
        deviceId: deviceIdRef.current,
        strokeId: strokeIdRef.current,
        color: strokeColor,
        width: strokeWidth,
        points: [last, p],
        done: false,
      }).catch((e: any) => {
        console.error("[chalk] broadcast move failed", e);
        setInfo(e?.message ?? "broadcast_failed");
      });

      const prev = lastMoveRef.current;
      const now = performance.now();

      if (prev) {
        const { w, h } = getCanvasSize();
        const dt = Math.max(1, now - prev.t);
        const dxPx = ((p.x - prev.x) / BOARD_LOGICAL_WIDTH) * w;
        const dyPx = ((p.y - prev.y) / BOARD_LOGICAL_HEIGHT) * h;
        const distPx = Math.sqrt(dxPx * dxPx + dyPx * dyPx);

        const speed01 = Math.max(0, Math.min(1, (distPx / dt) / 1.8));
        const pressure01 = Math.max(
          0,
          Math.min(1, 0.75 * (1 - speed01) + 0.02 * (penWidth - 2))
        );

        sounds.chalkMove(speed01, pressure01);
      }

      lastMoveRef.current = { t: now, x: p.x, y: p.y };
    };

    const onUp = (ev: PointerEvent) => {
      if (isTouchLike && touchMode === "pan") return;

      ev.preventDefault();

      if (!drawingRef.current) return;

      const p = getBoardPoint(ev);
      const last = lastPtRef.current;

      if (p && last) {
        const dx = p.x - last.x;
        const dy = p.y - last.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 >= 0.2) {
          pointsRef.current.push(p);
          drawLocalSegment(last, p);
          lastPtRef.current = p;
        }
      }

      void finalizeAndSend();
    };

    const onCancel = (ev: Event) => {
      ev.preventDefault?.();
      if (!drawingRef.current) return;
      void finalizeAndSend();
    };

    const onCtx = (ev: Event) => {
      ev.preventDefault?.();
    };

    const onBlur = () => {
      if (!drawingRef.current) return;
      void finalizeAndSend();
    };

    const onPageHide = () => {
      if (!drawingRef.current) return;
      void finalizeAndSend();
    };

    const onPointerLeave = () => {
      if (!drawingRef.current) return;
      void finalizeAndSend();
    };

    const onVis = () => {
      if (!document.hidden) return;
      if (!drawingRef.current) return;
      void finalizeAndSend();
    };

    if (watchdogRef.current) window.clearInterval(watchdogRef.current);
    watchdogRef.current = window.setInterval(() => {
      if (!drawingRef.current) sounds.dispose();
    }, 160);

    canvas.addEventListener("pointerdown", onDown, { passive: false });
    canvas.addEventListener("pointermove", onMove, { passive: false });
    canvas.addEventListener("pointerup", onUp, { passive: false });
    canvas.addEventListener("pointercancel", onCancel as EventListener, { passive: false });
    canvas.addEventListener("lostpointercapture", onCancel as EventListener, {
      passive: false,
    });
    canvas.addEventListener("pointerleave", onPointerLeave, { passive: false });
    canvas.addEventListener("contextmenu", onCtx as EventListener, { passive: false });

    window.addEventListener("pointerup", onUp, { passive: false });
    window.addEventListener("pointercancel", onCancel as EventListener, { passive: false });
    window.addEventListener("blur", onBlur);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel as EventListener);
      canvas.removeEventListener("lostpointercapture", onCancel as EventListener);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("contextmenu", onCtx as EventListener);

      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel as EventListener);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVis);

      if (watchdogRef.current) window.clearInterval(watchdogRef.current);
      watchdogRef.current = null;

      forceAbort();
    };
  }, [sessionId, penColor, penWidth, tool, sounds, isTouchLike, touchMode]);

  const onClear = async () => {
    clearRemoteOnly();

    const safeName = sanitizeDisplayName(displayNameRef.current);
    const optimisticRow: ChalkStrokeRow = {
      id: makeLocalRowId("clear"),
      session_id: sessionId,
      device_id: deviceIdRef.current,
      display_name: safeName,
      color: tool === "eraser" ? BOARD_BG : penColor,
      width: tool === "eraser" ? ERASER_WIDTH : penWidth,
      points: [],
      kind: "clear",
      created_at: new Date().toISOString(),
    };

    pendingRowsRef.current = upsertRows(pendingRowsRef.current, [optimisticRow]);
    redrawScene();

    await sendBroadcastClear({
      sessionId,
      deviceId: deviceIdRef.current,
      clearAt: Date.now(),
    });

    const { data, error } = await supabaseBrowser
      .from("call_chalk_strokes")
      .insert({
        session_id: sessionId,
        device_id: deviceIdRef.current,
        display_name: safeName,
        color: tool === "eraser" ? BOARD_BG : penColor,
        width: tool === "eraser" ? ERASER_WIDTH : penWidth,
        points: [],
        kind: "clear",
      })
      .select(
        "id, session_id, device_id, display_name, color, width, points, kind, created_at"
      )
      .single();

    if (error) {
      console.error("[chalk] clear failed", {
        sessionId,
        message: error.message,
      });
      setInfo(`クリア送信失敗: ${error.message}`);
      pendingRowsRef.current = pendingRowsRef.current.filter(
        (row) => row.id !== optimisticRow.id
      );
      redrawScene();
      return;
    }

    if (data) {
      console.log("[chalk] clear success", {
        sessionId,
        id: data.id,
      });

      persistedRowsRef.current = upsertRows(persistedRowsRef.current, [
        data as ChalkStrokeRow,
      ]);
    }

    pendingRowsRef.current = pendingRowsRef.current.filter(
      (row) => row.id !== optimisticRow.id
    );

    redrawScene();
    setInfo("");
  };

  return (
    <div
      style={{
        marginTop: 10,
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        >
          <label style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>
            太さ
            <input
              type="range"
              min={1}
              max={10}
              value={tool === "eraser" ? Math.min(10, penWidth) : penWidth}
              onChange={(e) => setPenWidth(Number(e.target.value))}
              style={{ marginLeft: 8, verticalAlign: "middle" }}
            />
          </label>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
          >
            {CHALK_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                title={c.name}
                onClick={() => {
                  setTool("chalk");
                  setPenColor(c.value);
                }}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  border:
                    tool === "chalk" && penColor === c.value
                      ? "2px solid #111"
                      : "1px solid #bbb",
                  background: c.value,
                  cursor: "pointer",
                  boxShadow:
                    tool === "chalk" && penColor === c.value
                      ? "0 0 0 2px rgba(255,255,255,0.5) inset"
                      : "none",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                }}
              />
            ))}

            <button
              type="button"
              onClick={() => setTool("eraser")}
              style={{
                padding: "8px 10px",
                borderRadius: 12,
                border: tool === "eraser" ? "2px solid #111" : "1px solid #ddd",
                background: "#fff",
                color: "#111",
                fontWeight: 900,
                cursor: "pointer",
                userSelect: "none",
                WebkitUserSelect: "none",
              }}
            >
              黒板消し
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
                userSelect: "none",
                WebkitUserSelect: "none",
              }}
            >
              全消し
            </button>
          </div>
        </div>
      </div>

      {isTouchLike ? (
        <div
          style={{
            marginTop: 8,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        >
          <button
            type="button"
            onClick={() => setTouchMode("draw")}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: touchMode === "draw" ? "2px solid #111" : "1px solid #d1d5db",
              background: touchMode === "draw" ? "#111827" : "#fff",
              color: touchMode === "draw" ? "#fff" : "#111827",
              fontWeight: 900,
              cursor: "pointer",
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
          >
            描画モード
          </button>

          <button
            type="button"
            onClick={() => setTouchMode("pan")}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: touchMode === "pan" ? "2px solid #111" : "1px solid #d1d5db",
              background: touchMode === "pan" ? "#111827" : "#fff",
              color: touchMode === "pan" ? "#fff" : "#111827",
              fontWeight: 900,
              cursor: "pointer",
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
          >
            移動モード
          </button>

          <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
            {touchMode === "draw"
              ? "1本指で描画"
              : "横スクロールして全体を確認"}
          </span>
        </div>
      ) : null}

      <div
        style={{
          marginTop: 10,
          borderRadius: 16,
          border: "1px solid rgba(0,0,0,0.08)",
          background: BOARD_OUTER_BG,
          padding: 10,
          overflowX: "auto",
          overflowY: "hidden",
          WebkitOverflowScrolling: "touch",
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
        }}
      >
        <div
          ref={boardSurfaceRef}
          style={{
            position: "relative",
            width: "100%",
            maxWidth: "none",
            margin: "0 auto",
            minWidth: MOBILE_MIN_BOARD_WIDTH_PX,
            minHeight: isTouchLike ? 420 : 620,
            aspectRatio: `${BOARD_LOGICAL_WIDTH} / ${BOARD_LOGICAL_HEIGHT}`,
            borderRadius: 16,
            border: "2px solid #073126",
            background: BOARD_BG,
            boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.06)",
            overflow: "hidden",
            userSelect: "none",
            WebkitUserSelect: "none",
            WebkitTouchCallout: "none",
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              display: "block",
              width: "100%",
              height: "100%",
              userSelect: "none",
              WebkitUserSelect: "none",
              WebkitTouchCallout: "none",
              touchAction: isTouchLike
                ? touchMode === "pan"
                  ? "pan-x pan-y"
                  : "none"
                : "none",
              cursor:
                tool === "eraser"
                  ? "cell"
                  : isTouchLike && touchMode === "pan"
                    ? "grab"
                    : "crosshair",
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default SharedCanvasBoard;