/** Max user-facing class title length (Japanese UX). */
export const CLASS_DISPLAY_NAME_MAX_LEN = 30;

export function normalizeClassDisplayName(raw: unknown): {
  ok: true;
  value: string;
} | {
  ok: false;
  error: string;
} {
  const trimmed = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return { ok: false, error: "display_name_blank" };
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(trimmed)) {
    return { ok: false, error: "display_name_invalid_chars" };
  }
  if (trimmed.length > CLASS_DISPLAY_NAME_MAX_LEN) {
    return { ok: false, error: "display_name_too_long" };
  }
  return { ok: true, value: trimmed };
}

/**
 * Prefer member-edited display_name; fall back to system `name`
 * (e.g. クラス0078Q).
 */
export function resolveClassTitle(params: {
  name?: string | null;
  displayName?: string | null;
  display_name?: string | null;
}): string {
  const display = String(
    params.displayName ?? params.display_name ?? ""
  ).trim();
  if (display) return display;
  const name = String(params.name ?? "").trim();
  return name || "クラス";
}

/** Extract serial/management label from system name when possible. */
export function resolveClassManagementLabel(params: {
  name?: string | null;
  classId?: string | null;
}): string {
  const name = String(params.name ?? "").trim();
  const match = name.match(/クラス([0-9]{4}[A-Z])/i);
  if (match?.[1]) return match[1].toUpperCase();
  const id = String(params.classId ?? "").trim();
  if (id.length >= 6) return id.slice(-6).toUpperCase();
  return id || "—";
}

export function buildClassCoverPublicUrl(
  coverPath: string | null | undefined,
  opts?: { baseUrl?: string | null }
): string | null {
  const key = String(coverPath ?? "").trim();
  if (!key) return null;
  if (key.startsWith("http://") || key.startsWith("https://")) return key;
  const base = String(
    opts?.baseUrl ??
      process.env.NEXT_PUBLIC_SUPABASE_URL ??
      process.env.SUPABASE_URL ??
      ""
  )
    .trim()
    .replace(/\/$/, "");
  if (!base) return null;
  const encoded = key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${base}/storage/v1/object/public/class-covers/${encoded}?v=${encodeURIComponent(key)}`;
}
