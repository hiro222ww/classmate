/** Shared default profile avatar when no photo is set (or load fails). */
export const DEFAULT_AVATAR_SRC = "/default-avatar.jpg";

/** Crisp vector twin for inline / CSS fallbacks. */
export const DEFAULT_AVATAR_SVG_SRC = "/default-avatar.svg";

export function isDefaultAvatarSrc(src?: string | null): boolean {
  const value = String(src ?? "").trim();
  if (!value) return true;
  return (
    value === DEFAULT_AVATAR_SRC ||
    value === DEFAULT_AVATAR_SVG_SRC ||
    value.endsWith("/default-avatar.jpg") ||
    value.endsWith("/default-avatar.svg") ||
    value.includes("default-avatar.jpg") ||
    value.includes("default-avatar.svg")
  );
}
