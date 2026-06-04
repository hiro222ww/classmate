/**
 * Voice / call debug logging — off in production by default.
 * Enable: NEXT_PUBLIC_DEBUG_VOICE=true | ?debugVoice=1 | localStorage debugVoice=1
 * Disable: ?debugVoice=0 | localStorage.removeItem("debugVoice")
 */

export type DebugVoiceCategory =
  | "voice"
  | "peer"
  | "ice"
  | "signal"
  | "audio"
  | "members"
  | "presence"
  | "turn"
  | "settings"
  | "perf"
  | "reload"
  | "mic"
  | "playback"
  | "fetch";

const THROTTLE_DEFAULT_MS = 5000;
const BUFFER_MAX = 250;
const HINT_KEY = "__debugVoiceHintShown";

let cachedEnabled: boolean | null = null;
let hintShown = false;

const throttleAt = new Map<string, number>();
const onceKeys = new Set<string>();
const ringBuffer: Array<{ at: number; category: DebugVoiceCategory; line: string }> =
  [];

function isBrowser() {
  return typeof window !== "undefined";
}

function readUrlDebugVoice(): "on" | "off" | null {
  if (!isBrowser()) return null;
  try {
    const v = new URLSearchParams(window.location.search).get("debugVoice");
    if (v === "1" || v === "true") return "on";
    if (v === "0" || v === "false") return "off";
  } catch {
    return null;
  }
  return null;
}

function applyUrlDebugVoicePreference() {
  if (!isBrowser()) return;
  const pref = readUrlDebugVoice();
  if (pref === "on") {
    try {
      localStorage.setItem("debugVoice", "1");
    } catch {
      /* ignore */
    }
    maybePrintEnableHint();
  } else if (pref === "off") {
    try {
      localStorage.removeItem("debugVoice");
      localStorage.removeItem("voice_debug");
    } catch {
      /* ignore */
    }
    maybePrintDisableHint();
  }
}

function maybePrintEnableHint() {
  if (!isBrowser() || hintShown) return;
  if ((globalThis as Record<string, unknown>)[HINT_KEY]) return;
  (globalThis as Record<string, unknown>)[HINT_KEY] = true;
  hintShown = true;
  console.info(
    "[debug-voice] 詳細ログ ON — 無効化: ?debugVoice=0 または localStorage.removeItem('debugVoice')"
  );
}

function maybePrintDisableHint() {
  if (!isBrowser() || hintShown) return;
  hintShown = true;
  console.info(
    "[debug-voice] 詳細ログ OFF — 有効化: ?debugVoice=1 または localStorage.setItem('debugVoice','1')"
  );
}

export function isDebugVoiceEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_DEBUG_VOICE === "true") return true;
  if (process.env.DEBUG_VOICE === "true") return true;

  if (!isBrowser()) return false;

  if (cachedEnabled != null) return cachedEnabled;

  applyUrlDebugVoicePreference();

  try {
    if (localStorage.getItem("debugVoice") === "1") {
      cachedEnabled = true;
      return true;
    }
    if (localStorage.getItem("voice_debug") === "1") {
      cachedEnabled = true;
      return true;
    }
  } catch {
    cachedEnabled = false;
    return false;
  }

  if (process.env.NEXT_PUBLIC_VOICE_DEBUG === "true") {
    cachedEnabled = true;
    return true;
  }

  cachedEnabled = false;
  return false;
}

export function resetDebugVoiceCache() {
  cachedEnabled = null;
}

export function setDebugVoiceEnabled(enabled: boolean) {
  if (!isBrowser()) return;
  try {
    if (enabled) {
      localStorage.setItem("debugVoice", "1");
      maybePrintEnableHint();
    } else {
      localStorage.removeItem("debugVoice");
      maybePrintDisableHint();
    }
  } catch {
    /* ignore */
  }
  cachedEnabled = enabled;
}

export function inferCategoryFromLine(line: string): DebugVoiceCategory {
  const s = line;
  if (s.includes("[remote-audio]") || s.includes("[local-mic]")) return "audio";
  if (s.includes("[voice-signal]") || s.includes("[voice-signaling]")) return "signal";
  if (s.includes("[voice-perf]") || s.includes("[voice-perf]")) return "perf";
  if (s.includes("[turn]") || s.includes("TURN")) return "turn";
  if (s.includes("[session-members]") || s.includes("fetchMembers")) return "members";
  if (s.includes("[presence]") || s.includes("presence")) return "presence";
  if (s.includes("[voice-settings]") || s.includes("[p2p]") || s.includes("static-enabled"))
    return "settings";
  if (s.includes("ice-") || s.includes("[voice-ice]") || s.includes("ICE")) return "ice";
  if (s.includes("reload") || s.includes("bfcache") || s.includes("[call-lifecycle]"))
    return "reload";
  if (s.includes("playback") || s.includes("play-")) return "playback";
  if (s.includes("[fetch-retry]")) return "fetch";
  if (s.includes("[voice-peer]") || s.includes("[call-peer]")) return "peer";
  return "voice";
}

function sanitizeArg(arg: unknown): unknown {
  if (arg == null) return arg;
  if (typeof arg === "string") return arg;
  if (typeof arg === "number" || typeof arg === "boolean") return arg;
  if (arg instanceof RTCPeerConnection) {
    return {
      _type: "RTCPeerConnection",
      connectionState: arg.connectionState,
      iceConnectionState: arg.iceConnectionState,
      signalingState: arg.signalingState,
    };
  }
  if (typeof MediaStream !== "undefined" && arg instanceof MediaStream) {
    return {
      _type: "MediaStream",
      id: arg.id?.slice(-8),
      audioTracks: arg.getAudioTracks().length,
    };
  }
  if (typeof MediaStreamTrack !== "undefined" && arg instanceof MediaStreamTrack) {
    return {
      _type: "MediaStreamTrack",
      id: arg.id?.slice(-8),
      readyState: arg.readyState,
      enabled: arg.enabled,
    };
  }
  if (Array.isArray(arg)) {
    if (arg.length > 8) {
      return { _type: "array", length: arg.length };
    }
    return arg.map(sanitizeArg);
  }
  if (typeof arg === "object") {
    const o = arg as Record<string, unknown>;
    if ("iceServers" in o || "credential" in o || "password" in o) {
      return { _type: "redacted_ice_or_secret" };
    }
    const keys = Object.keys(o);
    if (keys.length > 12) {
      return { _type: "object", keys: keys.slice(0, 8), more: keys.length - 8 };
    }
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      const lower = k.toLowerCase();
      if (
        lower.includes("credential") ||
        lower.includes("secret") ||
        lower.includes("token") ||
        lower.includes("password")
      ) {
        out[k] = "[redacted]";
      } else {
        out[k] = sanitizeArg(o[k]);
      }
    }
    return out;
  }
  return String(arg);
}

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(sanitizeArg(a));
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

function pushBuffer(category: DebugVoiceCategory, line: string) {
  if (!isDebugVoiceEnabled()) return;
  ringBuffer.push({ at: Date.now(), category, line });
  if (ringBuffer.length > BUFFER_MAX) {
    ringBuffer.splice(0, ringBuffer.length - BUFFER_MAX);
  }
}

function shouldThrottle(key: string, ms: number): boolean {
  const now = Date.now();
  const prev = throttleAt.get(key) ?? 0;
  if (now - prev < ms) return true;
  throttleAt.set(key, now);
  return false;
}

export function getDebugVoiceRingBuffer() {
  return [...ringBuffer];
}

/** Drop-in replacement for console.log in voice/call code paths */
export function debugConsoleLog(...args: unknown[]) {
  if (!isDebugVoiceEnabled()) return;
  const line = formatArgs(args);
  const category = inferCategoryFromLine(line);
  const throttleKey = `${category}:${line.slice(0, 96)}`;
  if (shouldThrottle(throttleKey, THROTTLE_DEFAULT_MS)) return;
  pushBuffer(category, line);
  console.log(...args.map(sanitizeArg));
}

/** Drop-in replacement for console.info */
export function debugConsoleInfo(...args: unknown[]) {
  if (!isDebugVoiceEnabled()) return;
  const line = formatArgs(args);
  pushBuffer(inferCategoryFromLine(line), line);
  console.info(...args.map(sanitizeArg));
}

export function debugVoiceLog(
  category: DebugVoiceCategory,
  event: string,
  data?: Record<string, unknown>
) {
  if (!isDebugVoiceEnabled()) return;
  const parts = [`[${category}]`, event];
  if (data && Object.keys(data).length > 0) {
    try {
      parts.push(JSON.stringify(sanitizeArg(data)));
    } catch {
      parts.push("{...}");
    }
  }
  const line = parts.join(" ");
  pushBuffer(category, line);
  console.log(line);
}

export function debugVoiceOnce(
  key: string,
  category: DebugVoiceCategory,
  event: string,
  data?: Record<string, unknown>
) {
  if (!isDebugVoiceEnabled()) return;
  if (onceKeys.has(key)) return;
  onceKeys.add(key);
  debugVoiceLog(category, event, data);
}

export function debugVoiceThrottle(
  key: string,
  ms: number,
  category: DebugVoiceCategory,
  event: string,
  data?: Record<string, unknown>
) {
  if (!isDebugVoiceEnabled()) return;
  if (shouldThrottle(`${category}:${key}`, ms)) return;
  debugVoiceLog(category, event, data);
}

export function debugVoiceWarn(
  category: DebugVoiceCategory,
  event: string,
  data?: Record<string, unknown>
) {
  const line =
    `[${category}] ${event}` +
    (data ? ` ${JSON.stringify(sanitizeArg(data))}` : "");
  if (isDebugVoiceEnabled()) {
    pushBuffer(category, line);
    console.warn(line);
    return;
  }
  if (shouldThrottle(`warn:${category}:${event}`, THROTTLE_DEFAULT_MS)) return;
  console.warn(line);
}

/** Retryable / noisy network failures → debug only (throttled) */
export function debugVoiceRetryable(
  key: string,
  event: string,
  data?: Record<string, unknown>
) {
  if (isDebugVoiceEnabled()) {
    debugVoiceThrottle(key, 2000, "fetch", event, data);
    return;
  }
  if (shouldThrottle(`retry:${key}`, 10_000)) return;
  console.warn(`[fetch] ${event} (debug: ?debugVoice=1 for details)`);
}

if (isBrowser()) {
  applyUrlDebugVoicePreference();
  try {
    (globalThis as Record<string, unknown>).__debugVoiceBuffer =
      getDebugVoiceRingBuffer;
    (globalThis as Record<string, unknown>).__debugVoiceEnabled =
      isDebugVoiceEnabled;
    (globalThis as Record<string, unknown>).__setDebugVoiceEnabled =
      setDebugVoiceEnabled;
  } catch {
    /* ignore */
  }
}
