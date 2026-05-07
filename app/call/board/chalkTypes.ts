export type StrokePoint = { x: number; y: number };

export type ChalkStrokeRow = {
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

export type BroadcastStrokePayload = {
  sessionId: string;
  deviceId: string;
  strokeId: string;
  color: string;
  width: number;
  points: StrokePoint[];
  done?: boolean;
};

export type BroadcastClearPayload = {
  sessionId: string;
  deviceId: string;
  clearAt: number;
};

export const BOARD_BG = "#0b3b2e";
export const BOARD_OUTER_BG = "#08271e";
export const ERASER_WIDTH = 28;

export const BOARD_LOGICAL_WIDTH = 2200;
export const BOARD_LOGICAL_HEIGHT = 1100;

export const MOBILE_MIN_BOARD_WIDTH_PX = 1200;

export const CHALK_COLORS = [
  { name: "白", value: "#ffffff" },
  { name: "蛍光黄", value: "#fff44f" },
  { name: "蛍光ピンク", value: "#ff5ccf" },
  { name: "蛍光オレンジ", value: "#ff9f1c" },
  { name: "蛍光緑", value: "#39ff14" },
  { name: "蛍光青", value: "#4cc9f0" },
] as const;