import {
  BOARD_BG,
  BOARD_LOGICAL_HEIGHT,
  BOARD_LOGICAL_WIDTH,
  type ChalkStrokeRow,
  type StrokePoint,
} from "./chalkTypes";

export function sanitizeDisplayName(v: string | null | undefined) {
  const s = String(v ?? "").trim();
  if (!s || s === "You") return "参加者";
  return s;
}

export function makeStrokeId() {
  return `stroke_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function makeLocalRowId(prefix: string) {
  return `local-${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function applyStrokeStyle(
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

export function paintBoardBase(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number
) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = BOARD_BG;
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.restore();
}

export function drawStroke(
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

export function upsertRows(base: ChalkStrokeRow[], incoming: ChalkStrokeRow[]) {
  const map = new Map<string, ChalkStrokeRow>();

  for (const row of base) map.set(row.id, row);
  for (const row of incoming) map.set(row.id, row);

  return Array.from(map.values()).sort((a, b) => {
    const at = String(a.created_at ?? "");
    const bt = String(b.created_at ?? "");

    if (at !== bt) return at.localeCompare(bt);

    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });
}