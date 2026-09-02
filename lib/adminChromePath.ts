/**
 * Paths that must not run anonymous auth / device bootstrap.
 * Narrow on purpose: only the admin onboarding preview.
 */
export function shouldSkipAuthBootstrapForPath(
  pathname: string | null | undefined
): boolean {
  const p = String(pathname ?? "").split("?")[0].replace(/\/+$/, "") || "/";
  return p === "/admin/onboarding-preview";
}
