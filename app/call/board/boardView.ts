import {
  BOARD_LOGICAL_HEIGHT,
  BOARD_LOGICAL_WIDTH,
  type StrokePoint,
} from "./chalkTypes";

/** How the logical board maps into the canvas buffer / CSS box. */
export type BoardFitMode = "contain" | "cover";

export type BoardViewTransform = {
  /** Canvas CSS / buffer width in pixels. */
  canvasW: number;
  /** Canvas CSS / buffer height in pixels. */
  canvasH: number;
  /** Uniform scale: canvasPx = logical * scale + offset. */
  scale: number;
  offsetX: number;
  offsetY: number;
  fit: BoardFitMode;
};

export function getBoardViewTransform(
  canvasW: number,
  canvasH: number,
  fit: BoardFitMode
): BoardViewTransform {
  const w = Math.max(1, canvasW);
  const h = Math.max(1, canvasH);
  const sx = w / BOARD_LOGICAL_WIDTH;
  const sy = h / BOARD_LOGICAL_HEIGHT;
  const scale = fit === "cover" ? Math.max(sx, sy) : Math.min(sx, sy);
  return {
    canvasW: w,
    canvasH: h,
    scale,
    offsetX: (w - BOARD_LOGICAL_WIDTH * scale) / 2,
    offsetY: (h - BOARD_LOGICAL_HEIGHT * scale) / 2,
    fit,
  };
}

export function logicalToCanvasX(x: number, view: BoardViewTransform) {
  return x * view.scale + view.offsetX;
}

export function logicalToCanvasY(y: number, view: BoardViewTransform) {
  return y * view.scale + view.offsetY;
}

export function canvasCssToLogical(
  xCss: number,
  yCss: number,
  view: BoardViewTransform,
  opts?: { clamp?: boolean }
): StrokePoint | null {
  if (view.scale <= 0) return null;
  let x = (xCss - view.offsetX) / view.scale;
  let y = (yCss - view.offsetY) / view.scale;

  if (opts?.clamp !== false) {
    x = Math.min(BOARD_LOGICAL_WIDTH, Math.max(0, x));
    y = Math.min(BOARD_LOGICAL_HEIGHT, Math.max(0, y));
  } else if (
    x < 0 ||
    y < 0 ||
    x > BOARD_LOGICAL_WIDTH ||
    y > BOARD_LOGICAL_HEIGHT
  ) {
    return null;
  }

  return { x, y };
}
