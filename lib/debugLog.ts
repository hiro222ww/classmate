/**
 * App-wide debug logging gate.
 * Enable: NODE_ENV=development | NEXT_PUBLIC_DEBUG_LOGS=true | ?debugLogs=1 | localStorage classmate_debug_logs=1
 * Disable: ?debugLogs=0
 */

export type DebugLogCategory =
  | "room"
  | "call"
  | "voice"
  | "invite"
  | "presence"
  | "members"
  | "perf"
  | "audio"
  | "signal"
  | "general";

const DEBUG_LOGS_STORAGE_KEY = "classmate_debug_logs";
const DEBUG_LOGS_HINT_KEY = "__classmateDebugLogsHintShown";

let cachedEnabled: boolean | null = null;
let hintShown = false;

function isBrowser() {
  return typeof window !== "undefined";
}

function readUrlDebugLogs(): "on" | "off" | null {
  if (!isBrowser()) return null;
  try {
    const value = new URLSearchParams(window.location.search).get("debugLogs");
    if (value === "1" || value === "true") return "on";
    if (value === "0" || value === "false") return "off";
  } catch {
    return null;
  }
  return null;
}

function applyUrlDebugLogsPreference() {
  if (!isBrowser()) return;
  const pref = readUrlDebugLogs();
  if (pref === "on") {
    try {
      localStorage.setItem(DEBUG_LOGS_STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    maybePrintEnableHint();
  } else if (pref === "off") {
    try {
      localStorage.removeItem(DEBUG_LOGS_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    maybePrintDisableHint();
  }
}

function maybePrintEnableHint() {
  if (!isBrowser() || hintShown) return;
  if ((globalThis as Record<string, unknown>)[DEBUG_LOGS_HINT_KEY]) return;
  (globalThis as Record<string, unknown>)[DEBUG_LOGS_HINT_KEY] = true;
  hintShown = true;
  console.info(
    "[debug-log] 詳細ログ ON — 無効化: ?debugLogs=0 または localStorage.removeItem('classmate_debug_logs')"
  );
}

function maybePrintDisableHint() {
  if (!isBrowser() || hintShown) return;
  hintShown = true;
  console.info(
    "[debug-log] 詳細ログ OFF — 有効化: ?debugLogs=1 または localStorage.setItem('classmate_debug_logs','1')"
  );
}

export function isDevelopmentEnv() {
  return process.env.NODE_ENV === "development";
}

export function isDebugLogEnabled(): boolean {
  if (isDevelopmentEnv()) return true;
  if (process.env.NEXT_PUBLIC_DEBUG_LOGS === "true") return true;

  if (!isBrowser()) return false;
  if (cachedEnabled != null) return cachedEnabled;

  applyUrlDebugLogsPreference();

  try {
    cachedEnabled = localStorage.getItem(DEBUG_LOGS_STORAGE_KEY) === "1";
  } catch {
    cachedEnabled = false;
  }
  return cachedEnabled;
}

export function resetDebugLogCache() {
  cachedEnabled = null;
}

export function setDebugLogEnabled(enabled: boolean) {
  if (!isBrowser()) return;
  try {
    if (enabled) {
      localStorage.setItem(DEBUG_LOGS_STORAGE_KEY, "1");
      maybePrintEnableHint();
    } else {
      localStorage.removeItem(DEBUG_LOGS_STORAGE_KEY);
      maybePrintDisableHint();
    }
  } catch {
    /* ignore */
  }
  cachedEnabled = enabled;
}

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
}

export function logDebug(
  category: DebugLogCategory,
  message: string,
  data?: unknown
) {
  if (!isDebugLogEnabled()) return;
  if (data !== undefined) {
    console.log(`[${category}] ${message}`, data);
    return;
  }
  console.log(`[${category}] ${message}`);
}

export function logDebugArgs(...args: unknown[]) {
  if (!isDebugLogEnabled()) return;
  console.log(...args);
}

export function logInfo(message: string, data?: unknown) {
  if (data !== undefined) {
    console.info(message, data);
    return;
  }
  console.info(message);
}

export function logWarn(message: string, data?: unknown) {
  if (data !== undefined) {
    console.warn(message, data);
    return;
  }
  console.warn(message);
}

export function logError(message: string, data?: unknown) {
  if (data !== undefined) {
    console.error(message, data);
    return;
  }
  console.error(message);
}

const PROD_LOG_EXCLUDE: RegExp[] = [
  /self_signal/,
  /wrong_target/,
  /reason=wrong_target/,
  /fetchStatus apply skipped=same_members/,
  /recovery-cancel/,
  /duplicate join skip|join skip.*duplicate|skip=duplicate/i,
  /play-success/,
  /passive-offer-skip/,
  /peer-state-reset/,
  /waiting_for_active_offer/,
  /\[voice-signal\] inbound/,
  /\[voice-stats\]/,
  /confirm-check/,
  /\[call-ready-check\]/,
  /\[call-render\]/,
  /\[call-members-debug\]/,
  /\[voice-start-check\]/,
  /\[voice-start-blocked\]/,
  /\[voice-mesh\]/,
  /\[room-perf\]/,
  /\[room-async\]/,
  /\[presence\]/,
  /\[member-source\]/,
  /\[invite-route\](?!.*(?:join-failed|mismatch|error))/,
  /\[remote-audio\].*(?:play-start|play-success|mount|attach|srcObject|props |reattach|play-attempt|play-deduped|playback-check|playback-health|playback-active|audio-output-config)/,
  /\[session-members\](?!.*(?:failed|error|blocked))/i,
];

const PROD_LOG_INCLUDE: RegExp[] = [
  /\b(?:error|failed|failure)\b/i,
  /invite[_-]expired|session_closed/,
  /audio_confirmed_strict/,
  /\[call-status\]/,
  /\[invite-join\].*\b(?:failed|success)\b/,
  /\[invite-error-ui\]/,
  /auto-hard-reset-give-up|auto_hard_reset_give_up/,
  /reconnect.*(?:give.?up|max_attempt|exhausted)/i,
  /\[voice-peer\].*\b(?:failed|error|give-up|give_up)\b/i,
];

export function shouldEmitProductionLogLine(line: string): boolean {
  const text = String(line ?? "");
  if (!text.trim()) return false;
  if (PROD_LOG_EXCLUDE.some((pattern) => pattern.test(text))) return false;
  return PROD_LOG_INCLUDE.some((pattern) => pattern.test(text));
}

export function shouldEmitProductionLogArgs(...args: unknown[]): boolean {
  return shouldEmitProductionLogLine(formatArgs(args));
}

if (isBrowser()) {
  applyUrlDebugLogsPreference();
  try {
    (globalThis as Record<string, unknown>).__debugLogEnabled = isDebugLogEnabled;
    (globalThis as Record<string, unknown>).__setDebugLogEnabled =
      setDebugLogEnabled;
  } catch {
    /* ignore */
  }
}
