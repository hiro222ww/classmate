import { isAppShellPath } from "@/lib/appShell";
import { isAppShellContext } from "@/lib/appShellContext";
import { isImmersiveShellPath } from "@/lib/immersiveShellPaths";

const HIDDEN_PREFIXES = [
  "/admin",
  "/login",
  "/auth/callback",
  "/privacy",
  "/terms",
  "/guidelines",
  "/about",
  "/legal",
];

const DASHBOARD_HEADER_PATHS = new Set(["/", "/class/select", "/class/mine"]);

/** Room / call own chrome — never show the sticky Google login bar. */
export function isRoomOrCallPath(pathname: string): boolean {
  const path = String(pathname ?? "").trim() || "/";
  return (
    path === "/room" ||
    path.startsWith("/room/") ||
    path === "/call" ||
    path.startsWith("/call/") ||
    // Local visual fixtures that mirror room/call chrome
    path === "/dev/call-chrome" ||
    path.startsWith("/dev/call-chrome/")
  );
}

/**
 * Sticky top account nav (Google login / account chip).
 * Hidden on room & call so the sunset hero starts at the viewport top.
 */
export function shouldHideAccountNav(pathname: string): boolean {
  const path = String(pathname ?? "").trim() || "/";
  if (isAppShellPath(path)) return true;
  if (isRoomOrCallPath(path)) return true;
  if (isAppShellContext() && isImmersiveShellPath(path)) return true;
  if (HIDDEN_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  return DASHBOARD_HEADER_PATHS.has(path);
}
