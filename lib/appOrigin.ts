/**
 * Canonical app origin for user-facing URLs (invite links, Stripe redirects, push, OGP).
 * Prefer NEXT_PUBLIC_APP_ORIGIN, then NEXT_PUBLIC_APP_URL.
 */

const LOCAL_DEV_ORIGIN = "http://localhost:3000";

function readEnvOrigin(): string {
  return String(
    process.env.NEXT_PUBLIC_APP_ORIGIN ?? process.env.NEXT_PUBLIC_APP_URL ?? ""
  )
    .trim()
    .replace(/\/+$/, "");
}

/** Preview / internal server fallback when public env is unset (not for share URLs). */
function readPreviewServerOrigin(): string | null {
  const vercel = String(process.env.VERCEL_URL ?? "").trim().replace(/\/+$/, "");
  if (!vercel || vercel.includes("localhost")) return null;
  return `https://${vercel}`;
}

/**
 * Server-side canonical origin (Stripe, push, metadata).
 * Never uses request Origin / VERCEL_URL for production share URLs when env is set.
 */
export function resolveAppOrigin(fallback = LOCAL_DEV_ORIGIN): string {
  const fromEnv = readEnvOrigin();
  if (fromEnv) return fromEnv;
  return readPreviewServerOrigin() ?? fallback;
}

/**
 * Client-safe origin for copy/share links.
 * Uses env when set (production domain); otherwise current browser origin (local/preview).
 */
export function getAppOrigin(fallback = LOCAL_DEV_ORIGIN): string {
  const fromEnv = readEnvOrigin();
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined") {
    return window.location.origin.replace(/\/+$/, "") || fallback;
  }
  return resolveAppOrigin(fallback);
}

export function buildAppUrl(path: string, fallback?: string): string {
  const origin = getAppOrigin(fallback);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${normalizedPath}`;
}

export type BuildInviteRoomUrlParams = {
  classId: string;
  sessionId: string;
  inviter?: string;
};

/** Absolute invite URL for clipboard / share (always canonical when env is set). */
export function buildInviteRoomUrl(params: BuildInviteRoomUrlParams): string {
  const search = new URLSearchParams({
    invite: "1",
    autojoin: "1",
    classId: params.classId,
    sessionId: params.sessionId,
  });
  const inviter = String(params.inviter ?? "").trim();
  if (inviter) {
    search.set("inviter", inviter);
  }
  return buildAppUrl(`/room?${search.toString()}`);
}
