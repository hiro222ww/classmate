/**
 * Hard navigation helpers for leaving /call.
 *
 * Next.js App Router `router.push("/#hash")` (and Capacitor WKWebView soft
 * history updates) can no-op or leave the call chrome mounted. Exit must use
 * a full document navigation after local teardown so mic/voice always stop
 * and the user always leaves /call.
 */

/** Build home#マイクラス href with `?dev=` on the path, never after the hash. */
export function buildCallExitHomeHref(params: {
  dashboardPath: string;
  sectionId: string;
  withDev: (path: string) => string;
}): string {
  const base = params.withDev(String(params.dashboardPath ?? "").trim() || "/");
  const section = String(params.sectionId ?? "").trim();
  if (!section) return base;
  return `${base}#${section}`;
}

/**
 * Waiting-room href after leaving a normal (official / My Class) call.
 * autojoin=0 so Room does not bounce the user back into /call.
 * openJoinedClass=1 keeps the "joined class" waiting UX and membership context.
 */
export function buildCallExitWaitingRoomHref(params: {
  classId: string;
  sessionId: string;
  withDev: (path: string) => string;
  openJoinedClass?: boolean;
}): string {
  const classId = String(params.classId ?? "").trim();
  const sessionId = String(params.sessionId ?? "").trim();
  const search = new URLSearchParams();
  search.set("autojoin", "0");
  if (classId) search.set("classId", classId);
  if (sessionId) search.set("sessionId", sessionId);
  if (params.openJoinedClass !== false) search.set("openJoinedClass", "1");
  return params.withDev(`/room?${search.toString()}`);
}

/**
 * Normal class / My Class / promoted official → waiting room.
 * Random / provisional match → keep legacy home exit.
 */
export function shouldExitCallToWaitingRoom(params: {
  classId?: string | null;
  lifecycle?: string | null;
  openJoinedClass?: boolean | null;
}): boolean {
  const classId = String(params.classId ?? "").trim();
  if (!classId) return false;
  if (params.openJoinedClass === true) return true;
  const lifecycle = String(params.lifecycle ?? "").trim().toLowerCase();
  if (lifecycle === "provisional") return false;
  if (lifecycle === "official") return true;
  // Unknown lifecycle: stay on home so random voice exit is unchanged
  // when vote-status has not loaded yet.
  return false;
}

/** Full page leave — preferred over Next soft navigation inside iOS shells. */
export function navigateCallExit(href: string): void {
  const target = String(href ?? "").trim();
  if (!target || typeof window === "undefined") return;
  try {
    window.location.assign(target);
  } catch {
    window.location.href = target;
  }
}

/** @deprecated Prefer navigateCallExit — same hard navigation. */
export function navigateCallExitHome(href: string): void {
  navigateCallExit(href);
}
