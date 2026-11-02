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

/** Full page leave — preferred over Next soft navigation inside iOS shells. */
export function navigateCallExitHome(href: string): void {
  const target = String(href ?? "").trim();
  if (!target || typeof window === "undefined") return;
  try {
    window.location.assign(target);
  } catch {
    window.location.href = target;
  }
}
