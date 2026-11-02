import { supabase } from "@/lib/supabaseClient";
import { DEFAULT_AVATAR_SRC, isDefaultAvatarSrc } from "@/lib/defaultAvatar";

/**
 * Normalize a Classmate profile photo storage path (or absolute URL).
 * Strips known bucket prefixes; keeps http(s) URLs intact.
 */
export function normalizeProfilePhotoPath(
  photoPath: string | null | undefined
): string | null {
  let s = String(photoPath ?? "").trim();
  if (!s) return null;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("profile-photos/")) {
    s = s.replace(/^profile-photos\//, "");
  }
  if (s.startsWith("avatars/")) {
    s = s.replace(/^avatars\//, "");
  }
  return s || null;
}

/**
 * Build a public profile-photos URL without encoding path separators.
 * Nested keys like `{deviceId}/profile-….jpg` must keep `/` in the path.
 */
export function buildProfilePhotoPublicUrl(
  photoPath: string | null | undefined,
  opts?: { baseUrl?: string | null; cacheKey?: string | null }
): string | null {
  const normalized = normalizeProfilePhotoPath(photoPath);
  if (!normalized) return null;
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized;
  }

  const base = String(
    opts?.baseUrl ??
      process.env.NEXT_PUBLIC_SUPABASE_URL ??
      process.env.SUPABASE_URL ??
      ""
  )
    .trim()
    .replace(/\/$/, "");

  if (base) {
    const encodedKey = normalized
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
    const cache =
      opts?.cacheKey != null && String(opts.cacheKey).trim()
        ? `?v=${encodeURIComponent(String(opts.cacheKey).trim())}`
        : `?v=${encodeURIComponent(normalized)}`;
    return `${base}/storage/v1/object/public/profile-photos/${encodedKey}${cache}`;
  }

  // Browser fallback via supabase-js public URL helper.
  const { data } = supabase.storage.from("profile-photos").getPublicUrl(normalized);
  const publicUrl = String(data?.publicUrl ?? "").trim();
  if (!publicUrl) return null;
  return `${publicUrl}?v=${encodeURIComponent(normalized)}`;
}

/**
 * Resolve the image src for CmAvatar / MemberListAvatar.
 * Prefer Classmate `photoPath` over derived `avatarUrl` so a broken
 * server-built URL cannot hide a valid storage path.
 */
export function resolveAvatarPhotoSrc(params: {
  photoPath?: string | null;
  avatarUrl?: string | null;
}): string | null {
  const fromPath = buildProfilePhotoPublicUrl(params.photoPath);
  if (fromPath && !isDefaultAvatarSrc(fromPath)) return fromPath;

  const direct = String(params.avatarUrl ?? "").trim();
  if (direct && !isDefaultAvatarSrc(direct)) return direct;

  return null;
}

/** Client helper matching historical getMemberAvatarUrl return shape. */
export function resolveMemberAvatarUrlOrDefault(
  photoPath?: string | null
): string {
  return buildProfilePhotoPublicUrl(photoPath) || DEFAULT_AVATAR_SRC;
}
