export const PAGE_VISIT_CLIENT_DEDUPE_MS = 30_000;
export const PAGE_VISIT_SERVER_DEDUPE_MS = 2 * 60_000;
export const PAGE_VISIT_UA_MAX_LEN = 300;
export const PAGE_VISIT_PATH_MAX_LEN = 200;
export const PAGE_VISIT_REFERRER_MAX_LEN = 300;

const BOT_UA_RE =
  /bot|crawl|spider|slurp|facebookexternalhit|bingpreview|yandex|baidu|semrush|ahrefs/i;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  const value = String(ua ?? "").trim();
  if (!value) return false;
  return BOT_UA_RE.test(value);
}

export function shouldTrackPagePath(pathname: string): boolean {
  const path = normalizePageVisitPath(pathname);
  if (!path) return false;
  if (path.startsWith("/admin")) return false;
  if (path.startsWith("/api")) return false;
  if (path.startsWith("/_next")) return false;
  if (path.startsWith("/brand/")) return false;
  if (/\.(png|jpe?g|gif|webp|svg|ico|css|js|map|txt|xml|webmanifest)$/i.test(path)) {
    return false;
  }
  return true;
}

export function normalizePageVisitPath(raw: unknown): string {
  let path = String(raw ?? "").trim();
  if (!path) return "";

  try {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      path = new URL(path).pathname;
    }
  } catch {
    // keep as-is
  }

  const q = path.indexOf("?");
  if (q >= 0) path = path.slice(0, q);
  const h = path.indexOf("#");
  if (h >= 0) path = path.slice(0, h);

  if (!path.startsWith("/")) path = `/${path}`;
  // collapse duplicate slashes
  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }

  if (path.length > PAGE_VISIT_PATH_MAX_LEN) {
    path = path.slice(0, PAGE_VISIT_PATH_MAX_LEN);
  }
  return path;
}

export function truncatePageVisitText(
  raw: unknown,
  maxLen: number
): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  return value.length > maxLen ? value.slice(0, maxLen) : value;
}

export function pageVisitDedupeVisitorKey(params: {
  userId?: string | null;
  deviceId?: string | null;
}): string | null {
  const userId = String(params.userId ?? "").trim();
  if (userId) return `u:${userId}`;
  const deviceId = String(params.deviceId ?? "").trim();
  if (deviceId) return `d:${deviceId}`;
  return null;
}

/** Tokyo calendar day bounds as ISO timestamps. */
export function tokyoTodayRangeIso(nowMs = Date.now()): {
  startIso: string;
  endIso: string;
  day: string;
} {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const day = fmt.format(new Date(nowMs)); // YYYY-MM-DD
  const startIso = new Date(`${day}T00:00:00+09:00`).toISOString();
  const endIso = new Date(`${day}T23:59:59.999+09:00`).toISOString();
  return { startIso, endIso, day };
}

export function isWithinDedupeWindow(params: {
  previousVisitedAt: string | null | undefined;
  nowMs?: number;
  windowMs?: number;
}): boolean {
  const prev = String(params.previousVisitedAt ?? "").trim();
  if (!prev) return false;
  const t = new Date(prev).getTime();
  if (!Number.isFinite(t)) return false;
  const nowMs = params.nowMs ?? Date.now();
  const windowMs = params.windowMs ?? PAGE_VISIT_SERVER_DEDUPE_MS;
  return nowMs - t < windowMs;
}
