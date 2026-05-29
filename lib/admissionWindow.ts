import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type GlobalJoinWindow = {
  enabled: boolean;
  start: string;
  end: string;
};

export type AdmissionStatusResult = {
  ok: true;
  open: boolean;
  admissionWindowEnabled: boolean;
  current: string;
  window: {
    enabled: boolean;
    start: string;
    end: string;
  } | null;
  text: string;
};

export const DEFAULT_GLOBAL_JOIN_WINDOW: GlobalJoinWindow = {
  enabled: false,
  start: "21:00",
  end: "21:30",
};

export function normalizeTimeToMinutes(raw: string): number | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
}

export function getJstClockNow() {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
  );

  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");

  return {
    current: `${hh}:${mm}:${ss}`,
    minutes: now.getHours() * 60 + now.getMinutes(),
  };
}

export function isMinuteInJoinWindow(
  nowMin: number,
  startMin: number,
  endMin: number
) {
  if (startMin <= endMin) {
    return nowMin >= startMin && nowMin <= endMin;
  }

  return nowMin >= startMin || nowMin <= endMin;
}

export function evaluateGlobalJoinWindow(
  window: GlobalJoinWindow
): AdmissionStatusResult {
  const { current, minutes: nowMin } = getJstClockNow();

  if (!window.enabled) {
    return {
      ok: true,
      open: true,
      admissionWindowEnabled: false,
      current,
      window: null,
      text: "入校受付中！",
    };
  }

  const startMin = normalizeTimeToMinutes(window.start);
  const endMin = normalizeTimeToMinutes(window.end);

  if (startMin === null || endMin === null) {
    console.warn("[admissionWindow] invalid global_join_window times", window);
    return {
      ok: true,
      open: true,
      admissionWindowEnabled: false,
      current,
      window: null,
      text: "入校受付中！",
    };
  }

  const open = isMinuteInJoinWindow(nowMin, startMin, endMin);
  const rangeLabel = `${window.start}〜${window.end}`;

  return {
    ok: true,
    open,
    admissionWindowEnabled: true,
    current,
    window: {
      enabled: true,
      start: window.start,
      end: window.end,
    },
    text: open
      ? `入校受付中！（受付時間：${rangeLabel}）`
      : `ただいま入校受付時間外です（受付時間：${rangeLabel}）`,
  };
}

export async function loadGlobalJoinWindowFromAppSettings(): Promise<GlobalJoinWindow> {
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "global_join_window")
    .maybeSingle();

  if (error) {
    throw error;
  }

  const value =
    data?.value && typeof data.value === "object"
      ? (data.value as Partial<GlobalJoinWindow>)
      : {};

  return {
    ...DEFAULT_GLOBAL_JOIN_WINDOW,
    enabled: Boolean(value.enabled),
    start: String(value.start ?? DEFAULT_GLOBAL_JOIN_WINDOW.start).trim(),
    end: String(value.end ?? DEFAULT_GLOBAL_JOIN_WINDOW.end).trim(),
  };
}

export async function getAdmissionStatus(): Promise<AdmissionStatusResult> {
  const window = await loadGlobalJoinWindowFromAppSettings();
  return evaluateGlobalJoinWindow(window);
}
