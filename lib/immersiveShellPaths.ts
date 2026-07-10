/** Room / Call / クラス選択など、フルスクリーン寄りの iOS アプリ UI 対象 */
export const IMMERSIVE_SHELL_PATH_PREFIXES = [
  "/room",
  "/call",
  "/class/select",
] as const;

export function isImmersiveShellPath(pathname: string): boolean {
  const path = String(pathname ?? "").trim() || "/";
  return IMMERSIVE_SHELL_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}
