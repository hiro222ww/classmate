"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
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
  /** Static chrome only — no Supabase / realtime / drawing (demo & screenshots). */
  previewOnly?: boolean;
  previewOverlayText?: string;
  /** Dev/test: in-memory strokes only (no Supabase / realtime). */
  localOnly?: boolean;
};

const BOARD_REALTIME_RESUBSCRIBE_MS = 4000;
const BOARD_STATUS_RECONNECTING = "再接続中…";

const BOARD_DRAWING_LOCK_CLASS = "classmate-board-drawing";
const BOARD_DRAW_ARMED_CLASS = "classmate-board-draw-armed";
const BOARD_FULLSCREEN_CLASS = "classmate-board-fullscreen";

function setBoardDrawingLock(active: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle(BOARD_DRAWING_LOCK_CLASS, active);
  if (active) {
    window.getSelection()?.removeAllRanges();
  }
}

function setBoardDrawArmed(active: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle(BOARD_DRAW_ARMED_CLASS, active);
}

function setBoardFullscreenLock(active: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle(BOARD_FULLSCREEN_CLASS, active);
  document.body.classList.toggle(BOARD_FULLSCREEN_CLASS, active);
}

const BOARD_TOUCH_GUARD: CSSProperties = {
  userSelect: "none",
  WebkitUserSelect: "none",
  WebkitTouchCallout: "none",
  WebkitTapHighlightColor: "transparent",
  overscrollBehavior: "contain",
};

function boardTouchAction(
  touchMode: "draw" | "pan"
): CSSProperties["touchAction"] {
  return touchMode === "pan" ? "pan-x pan-y" : "none";
}

const BOARD_ASPECT = `${BOARD_LOGICAL_WIDTH} / ${BOARD_LOGICAL_HEIGHT}`;

/** Letterboxed surface: never stretch logical strokes to a different aspect. */
function boardSurfaceLayoutStyle(isFullscreen: boolean, isTouchLike: boolean): CSSProperties {
  if (isFullscreen) {
    return {
      position: "relative",
      width: "auto",
      maxWidth: "100%",
      height: "auto",
      maxHeight: "100%",
      minWidth: 0,
      minHeight: 0,
      aspectRatio: BOARD_ASPECT,
      margin: "0 auto",
      borderRadius: 10,
      border: "2px solid #073126",
      background: BOARD_BG,
      boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.06)",
      overflow: "hidden",
      flex: "0 1 auto",
      alignSelf: "center",
      ...BOARD_TOUCH_GUARD,
    };
  }

  return {
    position: "relative",
    width: "100%",
    maxWidth: "none",
    margin: "0 auto",
    minWidth: MOBILE_MIN_BOARD_WIDTH_PX,
    minHeight: isTouchLike ? 420 : 620,
    aspectRatio: BOARD_ASPECT,
    borderRadius: 16,
    border: "2px solid #073126",
    background: BOARD_BG,
    boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.06)",
    overflow: "hidden",
    ...BOARD_TOUCH_GUARD,
  };
}

type FsDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FsEl = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

async function tryRequestNativeFullscreen(el: HTMLElement): Promise<boolean> {
  const node = el as FsEl;
  try {
    if (typeof node.requestFullscreen === "function") {
      await node.requestFullscreen();
      return document.fullscreenElement === el;
    }
    if (typeof node.webkitRequestFullscreen === "function") {
      await node.webkitRequestFullscreen();
      const doc = document as FsDoc;
      return (doc.webkitFullscreenElement ?? document.fullscreenElement) === el;
    }
  } catch {
    // iOS Safari rejects element fullscreen for arbitrary nodes — CSS fallback.
  }
  return false;
}

async function tryExitNativeFullscreen(): Promise<void> {
  const doc = document as FsDoc;
  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
      return;
    }
    if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) {
      await doc.webkitExitFullscreen();
    }
  } catch {
    // ignore
  }
}

function syncLayerToVisualViewport(layer: HTMLElement | null) {
  if (!layer) return;
  const vv = window.visualViewport;
  if (!vv) {
    layer.style.top = "0px";
    layer.style.left = "0px";
    layer.style.width = "100%";
    layer.style.height = "100dvh";
    return;
  }
  layer.style.top = `${vv.offsetTop}px`;
  layer.style.left = `${vv.offsetLeft}px`;
  layer.style.width = `${vv.width}px`;
  layer.style.height = `${vv.height}px`;
}

function SharedCanvasBoardPreview({
  overlayText,
}: {
  overlayText?: string;
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const nativeFsRef = useRef(false);
  const isTouchLike =
    typeof window !== "undefined" &&
    (("ontouchstart" in window && navigator.maxTouchPoints > 0) ||
      window.matchMedia("(pointer: coarse)").matches);

  const exitFullscreen = () => {
    nativeFsRef.current = false;
    setIsFullscreen(false);
    setToolsExpanded(false);
    void tryExitNativeFullscreen();
  };

  const enterFullscreen = () => {
    setToolsExpanded(false);
    setIsFullscreen(true);
  };

  const layoutPreviewSurface = () => {
    const scroll = scrollRef.current;
    const surface = surfaceRef.current;
    const layer = rootRef.current;
    if (!surface || !isFullscreen) {
      if (surface) {
        surface.style.width = "";
        surface.style.height = "";
      }
      return;
    }
    const toolbar = layer?.querySelector(".cm-board-toolbar") as HTMLElement | null;
    const toolbarH = toolbar?.offsetHeight ?? 40;
    const availW = Math.max(
      scroll?.clientWidth ?? 0,
      layer?.clientWidth ?? 0,
      window.innerWidth
    ) - 4;
    const availH =
      Math.max(
        scroll?.clientHeight ?? 0,
        (layer?.clientHeight ?? 0) > 0
          ? (layer?.clientHeight ?? 0) - toolbarH - 10
          : 0,
        window.innerHeight - toolbarH - 24
      ) - 4;
    if (availW < 2 || availH < 2) return;
    const aspect = BOARD_LOGICAL_WIDTH / BOARD_LOGICAL_HEIGHT;
    let w = availW;
    let h = w / aspect;
    if (h > availH) {
      h = availH;
      w = h * aspect;
    }
    surface.style.width = `${Math.floor(w)}px`;
    surface.style.height = `${Math.floor(h)}px`;
    surface.style.aspectRatio = "unset";
  };

  useEffect(() => {
    setBoardFullscreenLock(isFullscreen);
    if (!isFullscreen) {
      const layer = rootRef.current;
      if (layer) {
        layer.style.top = "";
        layer.style.left = "";
        layer.style.width = "";
        layer.style.height = "";
      }
      layoutPreviewSurface();
      return () => setBoardFullscreenLock(false);
    }

    const layer = rootRef.current;
    syncLayerToVisualViewport(layer);
    void (async () => {
      if (!layer) return;
      nativeFsRef.current = await tryRequestNativeFullscreen(layer);
      requestAnimationFrame(layoutPreviewSurface);
    })();

    const onVv = () => {
      syncLayerToVisualViewport(rootRef.current);
      layoutPreviewSurface();
    };
    window.visualViewport?.addEventListener("resize", onVv);
    window.visualViewport?.addEventListener("scroll", onVv);
    requestAnimationFrame(layoutPreviewSurface);
    return () => {
      setBoardFullscreenLock(false);
      window.visualViewport?.removeEventListener("resize", onVv);
      window.visualViewport?.removeEventListener("scroll", onVv);
    };
  }, [isFullscreen]);

  useEffect(() => {
    const onFsChange = () => {
      const doc = document as FsDoc;
      const active = Boolean(
        document.fullscreenElement ?? doc.webkitFullscreenElement
      );
      if (!active && nativeFsRef.current) {
        nativeFsRef.current = false;
        setIsFullscreen(false);
        setToolsExpanded(false);
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener(
      "webkitfullscreenchange",
      onFsChange as EventListener
    );
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        onFsChange as EventListener
      );
    };
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") exitFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  const board = (
    <div
      ref={rootRef}
      className={
        isFullscreen
          ? "classmate-board-root classmate-board-fullscreen-layer"
          : "classmate-board-root"
      }
      style={{ marginTop: 0, ...BOARD_TOUCH_GUARD }}
    >
      <div
        className={[
          "cm-board-toolbar",
          isFullscreen ? "cm-board-toolbar--fullscreen" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={BOARD_TOUCH_GUARD}
      >
        <div className="cm-board-toolbar-primary" style={BOARD_TOUCH_GUARD}>
          <div className="cm-board-swatches" style={BOARD_TOUCH_GUARD}>
            {CHALK_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                title={c.name}
                disabled
                className={[
                  "cm-board-swatch",
                  c.value === CHALK_COLORS[0]?.value
                    ? "cm-board-swatch--active"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ background: c.value, opacity: 0.9 }}
              />
            ))}
            <button type="button" disabled className="cm-board-tool-chip">
              消し
            </button>
          </div>
          <div className="cm-board-toolbar-quick">
            <button
              type="button"
              disabled
              className="cm-board-tool-chip cm-board-tool-chip--active"
            >
              描く
            </button>
            <button type="button" disabled className="cm-board-tool-chip">
              移動
            </button>
            {!isFullscreen ? (
              <button
                type="button"
                className="cm-board-tool-chip cm-board-tool-chip--fullscreen"
                onClick={enterFullscreen}
              >
                全画面
              </button>
            ) : (
              <button
                type="button"
                className="cm-board-fs-exit"
                onClick={exitFullscreen}
                aria-label="全画面を解除"
              >
                解除
              </button>
            )}
            <button
              type="button"
              disabled={!isFullscreen}
              className={[
                "cm-board-tool-more",
                toolsExpanded ? "cm-board-tool-more--open" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-label="黒板ツール"
              onClick={() => setToolsExpanded((v) => !v)}
            >
              ⋯
            </button>
          </div>
        </div>
        {toolsExpanded ? (
          <div className="cm-board-toolbar-more" style={BOARD_TOUCH_GUARD}>
            <label className="cm-board-width">
              太さ
              <input type="range" min={1} max={10} value={3} disabled />
            </label>
            <button
              type="button"
              disabled
              className="cm-board-tool-chip cm-board-tool-chip--danger"
            >
              全消し
            </button>
          </div>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        className="classmate-board-scroll"
        style={{
          marginTop: isFullscreen ? 0 : 8,
          flex: isFullscreen ? 1 : undefined,
          minHeight: isFullscreen ? 0 : undefined,
          borderRadius: isFullscreen ? 12 : 18,
          border: "none",
          boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.05)",
          background: isFullscreen ? BOARD_BG : BOARD_OUTER_BG,
          padding: isFullscreen ? 0 : 10,
          overflowX: isFullscreen ? "hidden" : "auto",
          overflowY: "hidden",
          display: isFullscreen ? "flex" : undefined,
          alignItems: isFullscreen ? "center" : undefined,
          justifyContent: isFullscreen ? "center" : undefined,
          ...BOARD_TOUCH_GUARD,
        }}
      >
        <div
          ref={surfaceRef}
          className="classmate-board-surface"
          style={{
            ...boardSurfaceLayoutStyle(isFullscreen, isTouchLike),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {overlayText ? (
            <div
              style={{
                padding: "16px 20px",
                color: "#e9fbe8",
                fontWeight: 900,
                fontSize: 14,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                textAlign: "center",
                textShadow: "0 1px 0 rgba(0,0,0,0.25)",
                maxWidth: "90%",
              }}
            >
              {overlayText}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (isFullscreen && typeof document !== "undefined") {
    return (
      <>
        <div
          className="classmate-board-fullscreen-placeholder"
          aria-hidden
          style={{ minHeight: 280, marginTop: 10 }}
        />
        {createPortal(board, document.body)}
      </>
    );
  }

  return board;
}

function SharedCanvasBoardLive({
  sessionId,
  localOnly = false,
}: {
  sessionId: string;
  localOnly?: boolean;
}) {
  const sessionIdRef = useRef(sessionId);
  const deviceIdRef = useRef("");
  const displayNameRef = useRef("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boardScrollRef = useRef<HTMLDivElement | null>(null);
  const boardSurfaceRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const nativeFsRef = useRef(false);

  const drawingRef = useRef(false);
  const pointsRef = useRef<StrokePoint[]>([]);
  const lastPtRef = useRef<StrokePoint | null>(null);
  const strokeIdRef = useRef("");

  const lastMoveRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const lastTapRef = useRef(0);
  const activePointerIdRef = useRef<number | null>(null);
  const penDoubleTapRef = useRef<{ t: number; x: number; y: number } | null>(
    null
  );
  const strokeStartedAtRef = useRef(0);
  const toolRef = useRef<"chalk" | "eraser">("chalk");
  const penColorLiveRef = useRef<string>(CHALK_COLORS[0].value);
  const penWidthLiveRef = useRef(3);

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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [toolsExpanded, setToolsExpanded] = useState(false);

  const exitFullscreen = () => {
    if (drawingRef.current) {
      // End in-progress stroke before remounting into the inline tree.
      drawingRef.current = false;
      setBoardDrawingLock(false);
    }
    nativeFsRef.current = false;
    setIsFullscreen(false);
    setToolsExpanded(false);
    void tryExitNativeFullscreen();
  };

  const enterFullscreen = () => {
    if (drawingRef.current) {
      drawingRef.current = false;
      setBoardDrawingLock(false);
    }
    setToolsExpanded(false);
    setIsFullscreen(true);
  };

  toolRef.current = tool;
  penColorLiveRef.current = penColor;
  penWidthLiveRef.current = penWidth;

  const sounds = useBoardSounds();

  useEffect(() => {
    return () => {
      setBoardDrawingLock(false);
      setBoardDrawArmed(false);
      setBoardFullscreenLock(false);
    };
  }, []);

  useEffect(() => {
    setBoardDrawArmed(touchMode === "draw");
    return () => setBoardDrawArmed(false);
  }, [touchMode]);

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

  const layoutFullscreenSurface = () => {
    const scroll = boardScrollRef.current;
    const boardSurface = boardSurfaceRef.current;
    const layer = rootRef.current;
    if (!boardSurface || !isFullscreen) return;

    const toolbar = layer?.querySelector(".cm-board-toolbar") as HTMLElement | null;
    const toolbarH = toolbar?.offsetHeight ?? 40;
    const layerW = layer?.clientWidth ?? 0;
    const layerH = layer?.clientHeight ?? 0;
    const scrollW = scroll?.clientWidth ?? 0;
    const scrollH = scroll?.clientHeight ?? 0;

    // Prefer the real fullscreen layer box — scroll flex height can be stale
    // right after portal / requestFullscreen.
    const availW = Math.max(scrollW, layerW, window.innerWidth) - 4;
    const availH =
      Math.max(
        scrollH,
        layerH > 0 ? layerH - toolbarH - 10 : 0,
        window.innerHeight - toolbarH - 24
      ) - 4;
    if (availW < 2 || availH < 2) return;

    const aspect = BOARD_LOGICAL_WIDTH / BOARD_LOGICAL_HEIGHT;
    let w = availW;
    let h = w / aspect;
    if (h > availH) {
      h = availH;
      w = h * aspect;
    }

    boardSurface.style.width = `${Math.floor(w)}px`;
    boardSurface.style.height = `${Math.floor(h)}px`;
    boardSurface.style.maxWidth = "100%";
    boardSurface.style.maxHeight = "100%";
    boardSurface.style.aspectRatio = "unset";
  };

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    const boardSurface = boardSurfaceRef.current;
    if (!canvas || !boardSurface) return;

    if (isFullscreen) {
      layoutFullscreenSurface();
    } else {
      boardSurface.style.width = "";
      boardSurface.style.height = "";
      boardSurface.style.aspectRatio = "";
    }

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
    if (localOnly) {
      redrawScene();
      return;
    }

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
    if (localOnly || !channelRef.current) return;

    return channelRef.current.send({
      type: "broadcast",
      event: "chalk_move",
      payload,
    });
  };

  const sendBroadcastClear = async (payload: BroadcastClearPayload) => {
    if (localOnly || !channelRef.current) return;

    return channelRef.current.send({
      type: "broadcast",
      event: "chalk_clear",
      payload,
    });
  };

  const getBoardPoint = (
    e: PointerEvent,
    opts?: { clamp?: boolean }
  ): StrokePoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;

    if (opts?.clamp !== false) {
      // Keep Pencil strokes alive near edges instead of dropping the point.
      x = Math.min(rect.width, Math.max(0, x));
      y = Math.min(rect.height, Math.max(0, y));
    } else if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
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

    if (localOnly) {
      setPersistedRows(
        upsertRows(persistedRowsRef.current, [optimisticRow])
      );
      pendingRowsRef.current = pendingRowsRef.current.filter(
        (row) => row.id !== optimisticRow.id
      );
      redrawScene();
      return;
    }

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

    if (localOnly) {
      setInfo("");
      return;
    }

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
    if (!sessionId || localOnly) return;

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
    window.visualViewport?.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("scroll", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("scroll", onResize);
    };
  }, [sessionId, isFullscreen]);

  useEffect(() => {
    setBoardFullscreenLock(isFullscreen);
    if (!isFullscreen) {
      const layer = rootRef.current;
      if (layer) {
        layer.style.top = "";
        layer.style.left = "";
        layer.style.width = "";
        layer.style.height = "";
      }
      return () => setBoardFullscreenLock(false);
    }

    const layer = rootRef.current;
    syncLayerToVisualViewport(layer);

    void (async () => {
      if (!rootRef.current) return;
      nativeFsRef.current = await tryRequestNativeFullscreen(rootRef.current);
      requestAnimationFrame(() => {
        resizeCanvas();
        redrawScene();
      });
    })();

    const onVv = () => {
      syncLayerToVisualViewport(rootRef.current);
      resizeCanvas();
      redrawScene();
    };
    window.visualViewport?.addEventListener("resize", onVv);
    window.visualViewport?.addEventListener("scroll", onVv);

    requestAnimationFrame(() => {
      resizeCanvas();
      redrawScene();
    });

    return () => {
      setBoardFullscreenLock(false);
      window.visualViewport?.removeEventListener("resize", onVv);
      window.visualViewport?.removeEventListener("scroll", onVv);
    };
  }, [isFullscreen]);

  useEffect(() => {
    const onFsChange = () => {
      const doc = document as FsDoc;
      const active = Boolean(
        document.fullscreenElement ?? doc.webkitFullscreenElement
      );
      if (!active && nativeFsRef.current) {
        nativeFsRef.current = false;
        setIsFullscreen(false);
        setToolsExpanded(false);
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener(
      "webkitfullscreenchange",
      onFsChange as EventListener
    );
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        onFsChange as EventListener
      );
    };
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") exitFullscreen();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  // Re-measure after portal remount / aspect letterbox layout.
  useEffect(() => {
    const surface = boardSurfaceRef.current;
    if (!surface || typeof ResizeObserver === "undefined") return;

    const ro = new ResizeObserver(() => {
      resizeCanvas();
      redrawScene();
    });
    ro.observe(surface);
    return () => ro.disconnect();
  }, [sessionId, isFullscreen]);

  useEffect(() => {
    const scroll = boardScrollRef.current;
    if (!scroll || touchMode !== "pan" || isTouchLike) return;

    let dragging = false;
    let startX = 0;
    let startScroll = 0;
    let pointerId = -1;

    const onPanDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      dragging = true;
      pointerId = ev.pointerId;
      startX = ev.clientX;
      startScroll = scroll.scrollLeft;
      scroll.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    };

    const onPanMove = (ev: PointerEvent) => {
      if (!dragging || ev.pointerId !== pointerId) return;
      scroll.scrollLeft = startScroll - (ev.clientX - startX);
      ev.preventDefault();
    };

    const endPan = (ev: PointerEvent) => {
      if (!dragging || ev.pointerId !== pointerId) return;
      dragging = false;
      pointerId = -1;
      scroll.releasePointerCapture?.(ev.pointerId);
      ev.preventDefault();
    };

    scroll.addEventListener("pointerdown", onPanDown, { passive: false });
    scroll.addEventListener("pointermove", onPanMove, { passive: false });
    scroll.addEventListener("pointerup", endPan, { passive: false });
    scroll.addEventListener("pointercancel", endPan, { passive: false });

    return () => {
      scroll.removeEventListener("pointerdown", onPanDown);
      scroll.removeEventListener("pointermove", onPanMove);
      scroll.removeEventListener("pointerup", endPan);
      scroll.removeEventListener("pointercancel", endPan);
    };
  }, [touchMode, isTouchLike, isFullscreen]);

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

    // Portal remount on fullscreen toggle recreates the <canvas>; this effect
    // must re-bind listeners (isFullscreen is an intentional dependency).
    canvas.dataset.drawBound = isFullscreen ? "fs" : "inline";

    const resetDrawingState = () => {
      drawingRef.current = false;
      lastMoveRef.current = null;
      lastPtRef.current = null;
      pointsRef.current = [];
      strokeIdRef.current = "";
      activePointerIdRef.current = null;
      setBoardDrawingLock(false);
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

    const isPrimaryDrawPointer = (ev: PointerEvent) => {
      if (activePointerIdRef.current == null) return true;
      return ev.pointerId === activePointerIdRef.current;
    };

    const onDown = (ev: PointerEvent) => {
      if (window.getSelection) {
        const sel = window.getSelection();
        if (sel && sel.removeAllRanges) sel.removeAllRanges();
      }

      const isPen = ev.pointerType === "pen";
      // Ignore palm / finger while a Pencil stroke is active.
      if (
        !isPen &&
        activePointerIdRef.current != null &&
        drawingRef.current
      ) {
        return;
      }

      // Apple Pencil / stylus should always draw, even if pan mode was left on.
      if (touchMode === "pan" && !isPen) return;

      // Eraser tip / barrel button when the browser exposes it.
      if (isPen && (ev.button === 5 || (ev.buttons & 32) === 32)) {
        setTool("eraser");
        toolRef.current = "eraser";
      }

      ev.preventDefault();
      ev.stopPropagation();

      const p = getBoardPoint(ev);
      if (!p) return;

      if (isPen) {
        const prev = penDoubleTapRef.current;
        const now = performance.now();
        const dx = prev ? p.x - prev.x : 0;
        const dy = prev ? p.y - prev.y : 0;
        const dist2 = dx * dx + dy * dy;
        // Logical board coords: ~28 units ≈ small tip double-tap.
        if (prev && now - prev.t <= 340 && dist2 <= 28 * 28) {
          penDoubleTapRef.current = null;
          const next = toolRef.current === "eraser" ? "chalk" : "eraser";
          toolRef.current = next;
          setTool(next);
          setInfo(
            next === "eraser" ? "黒板消し（ペンダブルタップ）" : "チョーク"
          );
          window.setTimeout(() => {
            setInfo((cur) =>
              cur === "黒板消し（ペンダブルタップ）" || cur === "チョーク"
                ? ""
                : cur
            );
          }, 1200);
          return;
        }
        penDoubleTapRef.current = { t: now, x: p.x, y: p.y };
      } else {
        penDoubleTapRef.current = null;
      }

      try {
        canvas.setPointerCapture(ev.pointerId);
      } catch {
        // Older WebKit may reject capture; continue without it.
      }

      activePointerIdRef.current = ev.pointerId;
      setBoardDrawingLock(true);

      const activeTool = toolRef.current;
      if (activeTool === "eraser") {
        materializeRemoteProgressAsPendingRows();
      }

      strokeColorRef.current =
        activeTool === "eraser" ? BOARD_BG : penColorLiveRef.current;
      strokeWidthRef.current =
        activeTool === "eraser" ? ERASER_WIDTH : penWidthLiveRef.current;

      drawingRef.current = true;
      pointsRef.current = [p];
      lastPtRef.current = p;
      lastMoveRef.current = { t: performance.now(), x: p.x, y: p.y };
      strokeStartedAtRef.current = performance.now();
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

      if (activeTool === "chalk" && now - lastTapRef.current > 260) {
        lastTapRef.current = now;
        sounds.chalkTap(0.35);
      }

      if (activeTool === "chalk") {
        sounds.chalkStart();
      }
    };

    const onMove = (ev: PointerEvent) => {
      if (!drawingRef.current) return;
      if (!isPrimaryDrawPointer(ev)) return;

      ev.preventDefault();

      const p = getBoardPoint(ev);
      const last = lastPtRef.current;
      if (!p || !last) return;

      const dx = p.x - last.x;
      const dy = p.y - last.y;
      const dist2 = dx * dx + dy * dy;

      if (dist2 < 0.8) return;

      // Moving meaningfully cancels pending double-tap candidate.
      if (ev.pointerType === "pen") {
        penDoubleTapRef.current = null;
      }

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
          Math.min(
            1,
            0.75 * (1 - speed01) + 0.02 * (penWidthLiveRef.current - 2)
          )
        );

        if (toolRef.current === "chalk") {
          sounds.chalkMove(speed01, pressure01);
        }
      }

      lastMoveRef.current = { t: now, x: p.x, y: p.y };
    };

    const onUp = (ev: PointerEvent) => {
      const isPen = ev.pointerType === "pen";
      if (touchMode === "pan" && !isPen) return;
      if (!isPrimaryDrawPointer(ev)) return;

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

      // Short Pencil tip-tap: keep for double-tap detection, don't save a speck.
      if (isPen) {
        const pts = pointsRef.current;
        const first = pts[0];
        const end = pts[pts.length - 1] ?? first;
        const travel2 = first
          ? (end.x - first.x) ** 2 + (end.y - first.y) ** 2
          : 0;
        const held = performance.now() - strokeStartedAtRef.current;
        if (pts.length <= 3 && travel2 <= 10 * 10 && held <= 280) {
          forceAbort();
          redrawScene();
          return;
        }
        // Real stroke — cancel pending double-tap.
        penDoubleTapRef.current = null;
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

    // Do NOT end the stroke on pointerleave — Apple Pencil often leaves the
    // canvas bounds briefly; setPointerCapture keeps delivering moves.

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
    // No lostpointercapture handler — iPad/Pencil can fire it mid-stroke.
    canvas.addEventListener("contextmenu", onCtx as EventListener, {
      passive: false,
    });

    const blockBoardDefault = (ev: Event) => {
      if (touchMode === "pan") return;
      ev.preventDefault();
    };

    const blockSelectWhileDrawing = (ev: Event) => {
      if (!drawingRef.current && touchMode !== "draw") return;
      ev.preventDefault();
    };

    canvas.addEventListener("selectstart", blockBoardDefault);
    canvas.addEventListener("dragstart", blockBoardDefault);
    document.addEventListener("selectstart", blockSelectWhileDrawing);

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
      canvas.removeEventListener("contextmenu", onCtx as EventListener);
      canvas.removeEventListener("selectstart", blockBoardDefault);
      canvas.removeEventListener("dragstart", blockBoardDefault);
      document.removeEventListener("selectstart", blockSelectWhileDrawing);

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
    // isFullscreen: portal remount recreates canvas; must rebind listeners.
  }, [sessionId, sounds, isTouchLike, touchMode, isFullscreen]);

  const board = (
    <div
      ref={rootRef}
      className={
        isFullscreen
          ? "classmate-board-root classmate-board-fullscreen-layer"
          : "classmate-board-root"
      }
      style={{
        ...(isFullscreen ? undefined : { marginTop: 10 }),
        ...BOARD_TOUCH_GUARD,
      }}
    >
      <div
        className={[
          "cm-board-toolbar",
          isFullscreen ? "cm-board-toolbar--fullscreen" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={BOARD_TOUCH_GUARD}
      >
        <div className="cm-board-toolbar-primary" style={BOARD_TOUCH_GUARD}>
          <div className="cm-board-swatches" style={BOARD_TOUCH_GUARD}>
            {CHALK_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                title={c.name}
                className={[
                  "cm-board-swatch",
                  tool === "chalk" && penColor === c.value
                    ? "cm-board-swatch--active"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => {
                  setTool("chalk");
                  setPenColor(c.value);
                }}
                style={{ background: c.value }}
              />
            ))}
            <button
              type="button"
              className={[
                "cm-board-tool-chip",
                tool === "eraser" ? "cm-board-tool-chip--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setTool("eraser")}
              aria-label="消しゴム"
              title="消し"
            >
              {isFullscreen ? "消" : "消し"}
            </button>
          </div>

          <div className="cm-board-toolbar-quick">
            <button
              type="button"
              className={[
                "cm-board-tool-chip",
                touchMode === "draw" ? "cm-board-tool-chip--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setTouchMode("draw")}
            >
              描く
            </button>
            <button
              type="button"
              className={[
                "cm-board-tool-chip",
                touchMode === "pan" ? "cm-board-tool-chip--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setTouchMode("pan")}
            >
              移動
            </button>
            {!isFullscreen ? (
              <button
                type="button"
                className="cm-board-tool-chip cm-board-tool-chip--fullscreen"
                onClick={enterFullscreen}
                aria-label="黒板を全画面表示"
                title="全画面"
              >
                全画面
              </button>
            ) : (
              <button
                type="button"
                className="cm-board-fs-exit"
                onClick={exitFullscreen}
                aria-label="全画面を解除"
              >
                解除
              </button>
            )}
            <button
              type="button"
              className={[
                "cm-board-tool-more",
                toolsExpanded ? "cm-board-tool-more--open" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-expanded={toolsExpanded}
              aria-label="黒板ツールをさらに表示"
              onClick={() => setToolsExpanded((v) => !v)}
            >
              ⋯
            </button>
          </div>
        </div>

        {toolsExpanded ? (
          <div className="cm-board-toolbar-more" style={BOARD_TOUCH_GUARD}>
            <label className="cm-board-width">
              太さ
              <input
                type="range"
                min={1}
                max={10}
                value={penWidth}
                onChange={(e) => setPenWidth(Number(e.target.value))}
              />
            </label>
            <button
              type="button"
              className="cm-board-tool-chip cm-board-tool-chip--danger"
              onClick={requestClear}
              aria-label="黒板をすべて消す"
            >
              全消し
            </button>
          </div>
        ) : null}
      </div>

      {info && !isFullscreen ? (
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
          marginTop: isFullscreen ? 0 : 10,
          flex: isFullscreen ? 1 : undefined,
          minHeight: isFullscreen ? 0 : undefined,
          borderRadius: isFullscreen ? 12 : 16,
          border: isFullscreen ? "none" : "1px solid rgba(0,0,0,0.08)",
          background: isFullscreen ? BOARD_BG : BOARD_OUTER_BG,
          padding: isFullscreen ? 0 : 10,
          overflowX: isFullscreen ? "hidden" : "auto",
          overflowY: "hidden",
          WebkitOverflowScrolling: "touch",
          display: isFullscreen ? "flex" : undefined,
          alignItems: isFullscreen ? "center" : undefined,
          justifyContent: isFullscreen ? "center" : undefined,
          ...BOARD_TOUCH_GUARD,
          touchAction: boardTouchAction(touchMode),
          cursor: touchMode === "pan" && !isTouchLike ? "grab" : undefined,
        }}
      >
        <div
          ref={boardSurfaceRef}
          className="classmate-board-surface"
          style={{
            ...boardSurfaceLayoutStyle(isFullscreen, isTouchLike),
            touchAction: boardTouchAction(touchMode),
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
              touchAction: boardTouchAction(touchMode),
              cursor:
                tool === "eraser"
                  ? "cell"
                  : touchMode === "pan"
                    ? isTouchLike
                      ? "grab"
                      : "grab"
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

  if (isFullscreen && typeof document !== "undefined") {
    return (
      <>
        <div
          className="classmate-board-fullscreen-placeholder"
          aria-hidden
          style={{ minHeight: 280, marginTop: 10 }}
        />
        {createPortal(board, document.body)}
      </>
    );
  }

  return board;
}

export default function SharedCanvasBoard({
  sessionId,
  previewOnly = false,
  previewOverlayText,
  localOnly = false,
}: SharedCanvasBoardProps) {
  if (previewOnly) {
    return <SharedCanvasBoardPreview overlayText={previewOverlayText} />;
  }
  return <SharedCanvasBoardLive sessionId={sessionId} localOnly={localOnly} />;
}