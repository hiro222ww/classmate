"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { getDeviceId } from "@/lib/device";
import { isDebugLogEnabled, logDebug } from "@/lib/debugLog";

import {
  BOARD_BG,
  BOARD_LOGICAL_HEIGHT,
  BOARD_LOGICAL_WIDTH,
  BOARD_OUTER_BG,
  CHALK_COLORS,
  ERASER_WIDTH,
  MOBILE_MIN_BOARD_WIDTH_PX,
  type BroadcastClearPayload,
  type BroadcastStrokePayload,
  type ChalkStrokeRow,
  type StrokePoint,
} from "./board/chalkTypes";

import {
  applyStrokeStyle,
  drawStroke,
  makeLocalRowId,
  makeStrokeId,
  paintBoardBase,
  sanitizeDisplayName,
  upsertRows,
} from "./board/chalkDraw";

import { useBoardSounds } from "./board/useBoardSounds";

type SharedCanvasBoardProps = {
  sessionId: string;
};

const BOARD_REALTIME_RESUBSCRIBE_MS = 4000;
const BOARD_STATUS_RECONNECTING = "再接続中…";

const BOARD_TOUCH_GUARD: CSSProperties = {
  userSelect: "none",
  WebkitUserSelect: "none",
  WebkitTouchCallout: "none",
  WebkitTapHighlightColor: "transparent",
  overscrollBehavior: "contain",
};

function boardTouchAction(
  isTouchLike: boolean,
  touchMode: "draw" | "pan"
): CSSProperties["touchAction"] {
  if (!isTouchLike) return "none";
  return touchMode === "pan" ? "pan-x pan-y" : "none";
}

function SharedCanvasBoard({ sessionId }: SharedCanvasBoardProps) {
  const sessionIdRef = useRef(sessionId);
  const deviceIdRef = useRef("");
  const displayNameRef = useRef("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boardScrollRef = useRef<HTMLDivElement | null>(null);
  const boardSurfaceRef = useRef<HTMLDivElement | null>(null);

  const drawingRef = useRef(false);
  const pointsRef = useRef<StrokePoint[]>([]);
  const lastPtRef = useRef<StrokePoint | null>(null);
  const strokeIdRef = useRef("");

  const lastMoveRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const lastTapRef = useRef(0);

  const watchdogRef = useRef<number | null>(null);
  const fallbackPollRef = useRef<number | null>(null);
  const clearBarrierAtMsRef = useRef<number>(0);

  const remoteProgressRef = useRef<Record<string, StrokePoint[]>>({});
  const remoteStyleRef = useRef<Record<string, { color: string; width: number }>>({});

  const channelRef =
    useRef<ReturnType<typeof supabaseBrowser.channel> | null>(null);
  const realtimeSessionRef = useRef("");
  const realtimeReconnectTimerRef = useRef<number | null>(null);
  const realtimeHadFailureRef = useRef(false);

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
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);

  const sounds = useBoardSounds();

  const getCanvasSize = () => {
    const canvas = canvasRef.current;
    if (!canvas) return { w: 0, h: 0 };
    return { w: canvas.width, h: canvas.height };
  };

  const getRowTimeMs = (row: ChalkStrokeRow) => {
    const t = new Date(row.created_at).getTime();
    return Number.isFinite(t) ? t : 0;
  };

  const normalizeRowsAfterLastClear = (rows: ChalkStrokeRow[]) => {
    const barrier = clearBarrierAtMsRef.current;

    const sorted = [...rows]
      .filter((row) => {
        if (row.kind === "clear") return true;
        if (!barrier) return true;
        return getRowTimeMs(row) > barrier;
      })
      .sort((a, b) => {
        const at = String(a.created_at ?? "");
        const bt = String(b.created_at ?? "");
        if (at !== bt) return at.localeCompare(bt);
        return String(a.id ?? "").localeCompare(String(b.id ?? ""));
      });

    let lastClearIndex = -1;

    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].kind === "clear") {
        lastClearIndex = i;
        clearBarrierAtMsRef.current = Math.max(
          clearBarrierAtMsRef.current,
          getRowTimeMs(sorted[i])
        );
      }
    }

    if (lastClearIndex >= 0) return sorted.slice(lastClearIndex);

    return sorted;
  };

  const setPersistedRows = (rows: ChalkStrokeRow[]) => {
    persistedRowsRef.current = normalizeRowsAfterLastClear(rows);
  };

  const setPendingRows = (rows: ChalkStrokeRow[]) => {
    pendingRowsRef.current = normalizeRowsAfterLastClear(rows);
  };

  const paintBase = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const { w, h } = getCanvasSize();
    if (w <= 0 || h <= 0) return;

    paintBoardBase(ctx, w, h);
  };

  const clearRemoteOnly = () => {
    remoteProgressRef.current = {};
    remoteStyleRef.current = {};
  };

  const materializeRemoteProgressAsPendingRows = () => {
    const now = Date.now();
    const rows: ChalkStrokeRow[] = [];

    for (const key of Object.keys(remoteProgressRef.current)) {
      const pts = remoteProgressRef.current[key];
      const style = remoteStyleRef.current[key];

      if (!pts || pts.length < 1) continue;

      const [deviceId = "remote"] = key.split(":");

      rows.push({
        id: `remote-pending-${key}`,
        session_id: sessionId,
        device_id: deviceId,
        display_name: "参加者",
        color: style?.color ?? "#ffffff",
        width: style?.width ?? 3,
        points: pts,
        kind: "stroke",
        created_at: new Date(now - 1).toISOString(),
      });
    }

    if (rows.length > 0) {
      setPendingRows(upsertRows(pendingRowsRef.current, rows));
    }

    clearRemoteOnly();
  };

  const resetBoardRowsForClear = (clearRow?: ChalkStrokeRow) => {
    if (clearRow) {
      clearBarrierAtMsRef.current = Math.max(
        clearBarrierAtMsRef.current,
        getRowTimeMs(clearRow)
      );
    } else {
      clearBarrierAtMsRef.current = Date.now();
    }

    persistedRowsRef.current = clearRow ? [clearRow] : [];
    pendingRowsRef.current = [];
    clearRemoteOnly();
  };

  const removeOneRemoteProgressFromDevice = (deviceId: string) => {
    const prefix = `${deviceId}:`;
    const keys = Object.keys(remoteProgressRef.current).filter((key) =>
      key.startsWith(prefix)
    );

    if (keys.length === 0) return;

    const targetKey = keys[0];

    delete remoteProgressRef.current[targetKey];
    delete remoteStyleRef.current[targetKey];
  };

  const redrawScene = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const { w, h } = getCanvasSize();
    if (w <= 0 || h <= 0) return;

    paintBoardBase(ctx, w, h);

    const mergedRows = normalizeRowsAfterLastClear(
      upsertRows(persistedRowsRef.current, pendingRowsRef.current)
    );

    for (const row of mergedRows) {
      if (row.kind === "clear") {
        paintBoardBase(ctx, w, h);
        continue;
      }

      drawStroke(
        ctx,
        {
          color: row.color,
          width: row.width,
          points: row.points ?? [],
        },
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

    paintBase();
  };

  const loadAll = async () => {
    const activeSessionId = sessionIdRef.current;
    if (!activeSessionId) return;

    const { data, error } = await supabaseBrowser
      .from("call_chalk_strokes")
      .select(
        "id, session_id, device_id, display_name, color, width, points, kind, created_at"
      )
      .eq("session_id", activeSessionId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      if (isDebugLogEnabled()) {
        logDebug("call", "[chalk] loadAll failed", {
          sessionId: activeSessionId,
          message: error.message,
        });
      }
      if (realtimeHadFailureRef.current) {
        setInfo(BOARD_STATUS_RECONNECTING);
      } else {
        setInfo(`黒板ロード失敗: ${error.message}`);
      }
      return;
    }

    if (sessionIdRef.current !== activeSessionId) return;

    const incoming = (data ?? []) as ChalkStrokeRow[];

    setPersistedRows(upsertRows(persistedRowsRef.current, incoming));
    redrawScene();
    if (!realtimeHadFailureRef.current) {
      setInfo("");
    }
  };

  const sendBroadcastStroke = async (payload: BroadcastStrokePayload) => {
    if (!channelRef.current) return;

    return channelRef.current.send({
      type: "broadcast",
      event: "chalk_move",
      payload,
    });
  };

  const sendBroadcastClear = async (payload: BroadcastClearPayload) => {
    if (!channelRef.current) return;

    return channelRef.current.send({
      type: "broadcast",
      event: "chalk_clear",
      payload,
    });
  };

  const getBoardPoint = (e: PointerEvent): StrokePoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;

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

  const persistWholeStroke = async (
    pts: StrokePoint[],
    color: string,
    width: number
  ) => {
    if (!pts || pts.length < 1) return;

    const safeName = sanitizeDisplayName(displayNameRef.current);

    const optimisticRow: ChalkStrokeRow = {
      id: makeLocalRowId("stroke"),
      session_id: sessionId,
      device_id: deviceIdRef.current,
      display_name: safeName,
      color,
      width,
      points: pts,
      kind: "stroke",
      created_at: new Date().toISOString(),
    };

    setPendingRows(upsertRows(pendingRowsRef.current, [optimisticRow]));
    redrawScene();

    const { data, error } = await supabaseBrowser
      .from("call_chalk_strokes")
      .insert({
        session_id: sessionId,
        device_id: deviceIdRef.current,
        display_name: safeName,
        color,
        width,
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

    pendingRowsRef.current = pendingRowsRef.current.filter(
      (row) => row.id !== optimisticRow.id
    );

    if (data) {
      setPersistedRows(
        upsertRows(persistedRowsRef.current, [data as ChalkStrokeRow])
      );
    }

    redrawScene();
    setInfo("");
  };

  const performClear = async () => {
    const safeName = sanitizeDisplayName(displayNameRef.current);

    const optimisticRow: ChalkStrokeRow = {
      id: makeLocalRowId("clear"),
      session_id: sessionId,
      device_id: deviceIdRef.current,
      display_name: safeName,
      color: BOARD_BG,
      width: 1,
      points: [],
      kind: "clear",
      created_at: new Date().toISOString(),
    };

    clearBarrierAtMsRef.current = Date.now();

    resetBoardRowsForClear(optimisticRow);
    paintBase();
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
        color: BOARD_BG,
        width: 1,
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
      pendingRowsRef.current = [];
      redrawScene();
      return;
    }

    if (data) {
      resetBoardRowsForClear(data as ChalkStrokeRow);
    }

    redrawScene();
    setInfo("");
  };

  const requestClear = () => {
    setShowClearConfirm(true);
  };

  const cancelClear = () => {
    if (clearBusy) return;
    setShowClearConfirm(false);
  };

  const confirmClear = async () => {
    if (clearBusy) return;
    setClearBusy(true);
    try {
      await performClear();
      setShowClearConfirm(false);
    } finally {
      setClearBusy(false);
    }
  };

  useEffect(() => {
    if (!showClearConfirm) return;

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") cancelClear();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showClearConfirm, clearBusy]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

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
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    realtimeSessionRef.current = sessionId;
    realtimeHadFailureRef.current = false;

    const clearReconnectTimer = () => {
      if (realtimeReconnectTimerRef.current != null) {
        window.clearTimeout(realtimeReconnectTimerRef.current);
        realtimeReconnectTimerRef.current = null;
      }
    };

    const teardownChannel = () => {
      const existing = channelRef.current;
      channelRef.current = null;
      if (existing) {
        void supabaseBrowser.removeChannel(existing);
      }
    };

    const scheduleRealtimeResubscribe = (activeSessionId: string) => {
      if (realtimeReconnectTimerRef.current != null) return;
      realtimeReconnectTimerRef.current = window.setTimeout(() => {
        realtimeReconnectTimerRef.current = null;
        if (realtimeSessionRef.current !== activeSessionId) return;
        connectRealtime(activeSessionId, true);
      }, BOARD_REALTIME_RESUBSCRIBE_MS);
    };

    const handleRealtimeDisconnect = (
      activeSessionId: string,
      status: string
    ) => {
      if (realtimeSessionRef.current !== activeSessionId) return;

      realtimeHadFailureRef.current = true;
      setInfo(BOARD_STATUS_RECONNECTING);

      if (isDebugLogEnabled()) {
        logDebug("call", "[chalk] realtime disconnected", {
          sessionId: activeSessionId,
          status,
        });
      }

      teardownChannel();
      if (!drawingRef.current) {
        void loadAll();
      }
      scheduleRealtimeResubscribe(activeSessionId);
    };

    const connectRealtime = (activeSessionId: string, isRetry: boolean) => {
      if (realtimeSessionRef.current !== activeSessionId) return;

      clearReconnectTimer();
      teardownChannel();

      if (isRetry && isDebugLogEnabled()) {
        logDebug("call", "[chalk] realtime resubscribe", {
          sessionId: activeSessionId,
        });
      }

      const ch = supabaseBrowser
        .channel(`chalk_live:${activeSessionId}`, {
          config: {
            broadcast: { self: false },
          },
        })
        .on("broadcast", { event: "chalk_move" }, ({ payload }) => {
          const p = payload as BroadcastStrokePayload;

          if (!p || p.sessionId !== activeSessionId) return;
          if (p.deviceId === deviceIdRef.current) return;

          const key = `${p.deviceId}:${p.strokeId}`;

          if (p.done) {
            return;
          }

          if (!p.points || p.points.length < 1) return;

          const prev = remoteProgressRef.current[key] ?? [];
          const nextPoints = [...prev];

          for (const pt of p.points) {
            const last = nextPoints[nextPoints.length - 1];
            if (!last || last.x !== pt.x || last.y !== pt.y) {
              nextPoints.push(pt);
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

          if (!p || p.sessionId !== activeSessionId) return;
          if (p.deviceId === deviceIdRef.current) return;

          clearBarrierAtMsRef.current = Math.max(
            clearBarrierAtMsRef.current,
            p.clearAt
          );

          const remoteClearRow: ChalkStrokeRow = {
            id: `remote-clear-${p.deviceId}-${p.clearAt}`,
            session_id: activeSessionId,
            device_id: p.deviceId,
            display_name: "参加者",
            color: BOARD_BG,
            width: 1,
            points: [],
            kind: "clear",
            created_at: new Date(p.clearAt).toISOString(),
          };

          resetBoardRowsForClear(remoteClearRow);
          paintBase();
          redrawScene();
        })
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "call_chalk_strokes",
            filter: `session_id=eq.${activeSessionId}`,
          },
          (payload: any) => {
            const row = payload?.new as ChalkStrokeRow;
            if (!row?.id) return;
            if (row.session_id !== activeSessionId) return;

            if (row.kind === "clear") {
              resetBoardRowsForClear(row);
              redrawScene();
              return;
            }

            removeOneRemoteProgressFromDevice(String(row.device_id ?? "").trim());
            setPersistedRows(upsertRows(persistedRowsRef.current, [row]));

            redrawScene();
          }
        );

      ch.subscribe((status) => {
        if (realtimeSessionRef.current !== activeSessionId) return;

        if (status === "SUBSCRIBED") {
          realtimeHadFailureRef.current = false;
          setInfo("");
          if (isDebugLogEnabled()) {
            logDebug("call", "[chalk] realtime subscribed", {
              sessionId: activeSessionId,
              isRetry,
            });
          }
          if (!drawingRef.current) {
            void loadAll();
          }
          return;
        }

        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          handleRealtimeDisconnect(activeSessionId, status);
        }
      });

      channelRef.current = ch;
    };

    connectRealtime(sessionId, false);

    return () => {
      realtimeSessionRef.current = "";
      realtimeHadFailureRef.current = false;
      clearReconnectTimer();
      teardownChannel();
      setInfo("");
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    const boot = async () => {
      setInfo("");
      resizeCanvas();
      paintBase();
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

  useEffect(() => {
    if (fallbackPollRef.current) {
      window.clearInterval(fallbackPollRef.current);
    }

    fallbackPollRef.current = window.setInterval(() => {
      if (!drawingRef.current) {
        void loadAll();
      }
    }, 5000);

    return () => {
      if (fallbackPollRef.current) {
        window.clearInterval(fallbackPollRef.current);
      }
      fallbackPollRef.current = null;
    };
  }, [sessionId]);

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

      resetDrawingState();

      if (finalPoints.length >= 1) {
        void persistWholeStroke(finalPoints, strokeColor, strokeWidth);
      }

      sounds.chalkEnd();

      window.setTimeout(() => {
        if (!drawingRef.current) {
          sounds.dispose();
        }
      }, 120);
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

      if (tool === "eraser") {
        materializeRemoteProgressAsPendingRows();
      }

      strokeColorRef.current = tool === "eraser" ? BOARD_BG : penColor;
      strokeWidthRef.current = tool === "eraser" ? ERASER_WIDTH : penWidth;

      drawingRef.current = true;
      pointsRef.current = [p];
      lastPtRef.current = p;
      lastMoveRef.current = { t: performance.now(), x: p.x, y: p.y };
      strokeIdRef.current = makeStrokeId();

      redrawScene();

      void sendBroadcastStroke({
        sessionId,
        deviceId: deviceIdRef.current,
        strokeId: strokeIdRef.current,
        color: strokeColorRef.current,
        width: strokeWidthRef.current,
        points: [p],
        done: false,
      }).catch((e: any) => {
        console.error("[chalk] broadcast start failed", e);
      });

      const now = performance.now();

      if (tool === "chalk" && now - lastTapRef.current > 260) {
        lastTapRef.current = now;
        sounds.chalkTap(0.35);
      }

      if (tool === "chalk") {
        sounds.chalkStart();
      }
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
        points: [p],
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

        const speed01 = Math.max(0, Math.min(1, distPx / dt / 1.8));
        const pressure01 = Math.max(
          0,
          Math.min(1, 0.75 * (1 - speed01) + 0.02 * (penWidth - 2))
        );

        if (tool === "chalk") {
          sounds.chalkMove(speed01, pressure01);
        }
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

    if (watchdogRef.current) {
      window.clearInterval(watchdogRef.current);
    }

    watchdogRef.current = window.setInterval(() => {
      if (!drawingRef.current) sounds.dispose();
    }, 180);

    canvas.addEventListener("pointerdown", onDown, { passive: false });
    canvas.addEventListener("pointermove", onMove, { passive: false });
    canvas.addEventListener("pointerup", onUp, { passive: false });
    canvas.addEventListener("pointercancel", onCancel as EventListener, {
      passive: false,
    });
    canvas.addEventListener("lostpointercapture", onCancel as EventListener, {
      passive: false,
    });
    canvas.addEventListener("pointerleave", onPointerLeave, { passive: false });
    canvas.addEventListener("contextmenu", onCtx as EventListener, {
      passive: false,
    });

    const blockBoardDefault = (ev: Event) => {
      if (isTouchLike && touchMode === "pan") return;
      ev.preventDefault();
    };

    canvas.addEventListener("selectstart", blockBoardDefault);
    canvas.addEventListener("dragstart", blockBoardDefault);

    const boardScroll = boardScrollRef.current;
    const boardSurface = boardSurfaceRef.current;

    for (const el of [boardScroll, boardSurface]) {
      el?.addEventListener("selectstart", blockBoardDefault);
      el?.addEventListener("dragstart", blockBoardDefault);
      el?.addEventListener("contextmenu", blockBoardDefault);
      el?.addEventListener("gesturestart", blockBoardDefault);
      el?.addEventListener("gesturechange", blockBoardDefault);
      el?.addEventListener("gestureend", blockBoardDefault);
    }

    window.addEventListener("pointerup", onUp, { passive: false });
    window.addEventListener("pointercancel", onCancel as EventListener, {
      passive: false,
    });
    window.addEventListener("blur", onBlur);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel as EventListener);
      canvas.removeEventListener(
        "lostpointercapture",
        onCancel as EventListener
      );
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("contextmenu", onCtx as EventListener);
      canvas.removeEventListener("selectstart", blockBoardDefault);
      canvas.removeEventListener("dragstart", blockBoardDefault);

      for (const el of [boardScroll, boardSurface]) {
        el?.removeEventListener("selectstart", blockBoardDefault);
        el?.removeEventListener("dragstart", blockBoardDefault);
        el?.removeEventListener("contextmenu", blockBoardDefault);
        el?.removeEventListener("gesturestart", blockBoardDefault);
        el?.removeEventListener("gesturechange", blockBoardDefault);
        el?.removeEventListener("gestureend", blockBoardDefault);
      }

      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel as EventListener);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVis);

      if (watchdogRef.current) {
        window.clearInterval(watchdogRef.current);
      }

      watchdogRef.current = null;
      forceAbort();
    };
  }, [sessionId, penColor, penWidth, tool, sounds, isTouchLike, touchMode]);

  return (
    <div
      className="classmate-board-root"
      style={{
        marginTop: 10,
        ...BOARD_TOUCH_GUARD,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          ...BOARD_TOUCH_GUARD,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
            flex: "1 1 auto",
            minWidth: 0,
            ...BOARD_TOUCH_GUARD,
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

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
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
                }}
              />
            ))}

            <button
              type="button"
              onClick={() => setTool("eraser")}
              style={{
                padding: "8px 10px",
                borderRadius: 12,
                border:
                  tool === "eraser" ? "2px solid #111" : "1px solid #ddd",
                background: "#fff",
                color: "#111",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              黒板消し
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={requestClear}
          aria-label="黒板をすべて消す"
          style={{
            flex: "0 0 auto",
            marginLeft: isTouchLike ? 0 : 12,
            marginTop: isTouchLike ? 4 : 0,
            padding: isTouchLike ? "10px 14px" : "8px 12px",
            minHeight: isTouchLike ? 44 : undefined,
            borderRadius: 12,
            border: "1px solid #fca5a5",
            background: "#fff5f5",
            color: "#b91c1c",
            fontWeight: 900,
            cursor: "pointer",
            boxShadow: "0 0 0 1px rgba(185, 28, 28, 0.08)",
          }}
        >
          🗑 全消し
        </button>
      </div>

      {isTouchLike ? (
        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setTouchMode("draw")}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border:
                touchMode === "draw" ? "2px solid #111" : "1px solid #d1d5db",
              background: touchMode === "draw" ? "#111827" : "#fff",
              color: touchMode === "draw" ? "#fff" : "#111827",
              fontWeight: 900,
              cursor: "pointer",
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
              border:
                touchMode === "pan" ? "2px solid #111" : "1px solid #d1d5db",
              background: touchMode === "pan" ? "#111827" : "#fff",
              color: touchMode === "pan" ? "#fff" : "#111827",
              fontWeight: 900,
              cursor: "pointer",
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

      {info ? (
        <div
          style={{
            marginTop: 8,
            fontSize: 12,
            color: info === BOARD_STATUS_RECONNECTING ? "#6b7280" : "#92400e",
            fontWeight: info === BOARD_STATUS_RECONNECTING ? 700 : 800,
          }}
        >
          {info}
        </div>
      ) : null}

      <div
        ref={boardScrollRef}
        className="classmate-board-scroll"
        style={{
          marginTop: 10,
          borderRadius: 16,
          border: "1px solid rgba(0,0,0,0.08)",
          background: BOARD_OUTER_BG,
          padding: 10,
          overflowX: "auto",
          overflowY: "hidden",
          WebkitOverflowScrolling: "touch",
          ...BOARD_TOUCH_GUARD,
          touchAction: boardTouchAction(isTouchLike, touchMode),
        }}
      >
        <div
          ref={boardSurfaceRef}
          className="classmate-board-surface"
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
            ...BOARD_TOUCH_GUARD,
            touchAction: boardTouchAction(isTouchLike, touchMode),
          }}
        >
          <canvas
            ref={canvasRef}
            className="classmate-board-canvas"
            style={{
              display: "block",
              width: "100%",
              height: "100%",
              ...BOARD_TOUCH_GUARD,
              touchAction: boardTouchAction(isTouchLike, touchMode),
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

      {showClearConfirm ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="board-clear-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            background: "rgba(15, 23, 42, 0.45)",
          }}
          onClick={cancelClear}
        >
          <div
            style={{
              width: "min(360px, 100%)",
              borderRadius: 18,
              background: "#fff",
              boxShadow: "0 24px 64px rgba(15, 23, 42, 0.24)",
              padding: 20,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2
              id="board-clear-title"
              style={{ margin: 0, fontSize: 18, fontWeight: 900, color: "#111827" }}
            >
              黒板をすべて消しますか？
            </h2>
            <p
              style={{
                margin: "10px 0 0",
                fontSize: 14,
                lineHeight: 1.6,
                color: "#4b5563",
                fontWeight: 700,
              }}
            >
              この操作は元に戻せません。
            </p>

            <div
              style={{
                marginTop: 18,
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={cancelClear}
                disabled={clearBusy}
                style={{
                  padding: isTouchLike ? "12px 16px" : "10px 14px",
                  minHeight: isTouchLike ? 44 : undefined,
                  borderRadius: 12,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  color: "#111827",
                  fontWeight: 900,
                  cursor: clearBusy ? "not-allowed" : "pointer",
                }}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => void confirmClear()}
                disabled={clearBusy}
                style={{
                  padding: isTouchLike ? "12px 16px" : "10px 14px",
                  minHeight: isTouchLike ? 44 : undefined,
                  borderRadius: 12,
                  border: "1px solid #dc2626",
                  background: "#dc2626",
                  color: "#fff",
                  fontWeight: 900,
                  cursor: clearBusy ? "not-allowed" : "pointer",
                  opacity: clearBusy ? 0.7 : 1,
                }}
              >
                すべて消す
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default SharedCanvasBoard;