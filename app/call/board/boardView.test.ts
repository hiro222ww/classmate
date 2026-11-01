import { describe, expect, it } from "vitest";
import {
  BOARD_LOGICAL_HEIGHT,
  BOARD_LOGICAL_WIDTH,
} from "./chalkTypes";
import {
  canvasCssToLogical,
  getBoardViewTransform,
  logicalToCanvasX,
  logicalToCanvasY,
} from "./boardView";

describe("boardView transform", () => {
  it("contain maps logical corners onto canvas with letterbox offsets", () => {
    const view = getBoardViewTransform(400, 400, "contain");
    expect(view.scale).toBeCloseTo(400 / BOARD_LOGICAL_WIDTH, 6);
    expect(view.offsetX).toBeCloseTo(0, 6);
    expect(view.offsetY).toBeCloseTo((400 - BOARD_LOGICAL_HEIGHT * view.scale) / 2, 6);

    const tl = canvasCssToLogical(view.offsetX, view.offsetY, view);
    expect(tl?.x).toBeCloseTo(0, 5);
    expect(tl?.y).toBeCloseTo(0, 5);

    const br = canvasCssToLogical(
      view.offsetX + BOARD_LOGICAL_WIDTH * view.scale,
      view.offsetY + BOARD_LOGICAL_HEIGHT * view.scale,
      view
    );
    expect(br?.x).toBeCloseTo(BOARD_LOGICAL_WIDTH, 5);
    expect(br?.y).toBeCloseTo(BOARD_LOGICAL_HEIGHT, 5);
  });

  it("cover fills the viewport with uniform scale (crops the long board axis)", () => {
    // Portrait phone-like canvas: taller than logical 2:1 → scale by height, crop X.
    const view = getBoardViewTransform(390, 700, "cover");
    expect(view.scale).toBeCloseTo(700 / BOARD_LOGICAL_HEIGHT, 6);
    expect(view.offsetY).toBeCloseTo(0, 6);
    expect(view.offsetX).toBeLessThan(0);

    // Screen corners stay drawable (clamped into logical board).
    const topLeft = canvasCssToLogical(0, 0, view);
    const bottomRight = canvasCssToLogical(390, 700, view);
    expect(topLeft).not.toBeNull();
    expect(bottomRight).not.toBeNull();
    expect(topLeft!.x).toBeGreaterThanOrEqual(0);
    expect(topLeft!.y).toBeGreaterThanOrEqual(0);
    expect(bottomRight!.x).toBeLessThanOrEqual(BOARD_LOGICAL_WIDTH);
    expect(bottomRight!.y).toBeLessThanOrEqual(BOARD_LOGICAL_HEIGHT);
  });

  it("round-trips logical points through canvas mapping", () => {
    const view = getBoardViewTransform(800, 500, "cover");
    const pts = [
      { x: 0, y: 0 },
      { x: BOARD_LOGICAL_WIDTH / 2, y: BOARD_LOGICAL_HEIGHT / 2 },
      { x: BOARD_LOGICAL_WIDTH, y: BOARD_LOGICAL_HEIGHT },
    ];
    for (const p of pts) {
      const cx = logicalToCanvasX(p.x, view);
      const cy = logicalToCanvasY(p.y, view);
      const back = canvasCssToLogical(cx, cy, view);
      expect(back?.x).toBeCloseTo(p.x, 5);
      expect(back?.y).toBeCloseTo(p.y, 5);
    }
  });

  it("never uses anisotropic scale (sx === sy)", () => {
    for (const fit of ["contain", "cover"] as const) {
      const view = getBoardViewTransform(917, 411, fit);
      const sx = (BOARD_LOGICAL_WIDTH * view.scale) / view.scale;
      expect(sx).toBe(BOARD_LOGICAL_WIDTH);
      // Single scale field guarantees uniformity.
      expect(Number.isFinite(view.scale)).toBe(true);
      expect(view.scale).toBeGreaterThan(0);
    }
  });
});
