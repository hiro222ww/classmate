/**
 * Best-effort fetch of a public X post body for reply drafting.
 * Uses a public syndication mirror when available. Never posts or DMs.
 * If fetch fails, callers must ask the operator for source_body.
 */

export type PublicXPostFetch =
  | {
      ok: true;
      sourceUrl: string;
      sourcePostId: string;
      sourceAuthor: string | null;
      sourceBody: string;
      source: "fxtwitter";
    }
  | { ok: false; error: string; detail?: string };

const X_STATUS_RE =
  /^(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/([^/?#]+)\/status\/(\d+)/i;

export function parseXStatusUrl(raw: string): {
  sourceUrl: string;
  sourceAuthor: string;
  sourcePostId: string;
} | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  const m = trimmed.match(X_STATUS_RE);
  if (!m) return null;
  const author = m[1];
  const id = m[2];
  return {
    sourceUrl: `https://x.com/${author}/status/${id}`,
    sourceAuthor: author,
    sourcePostId: id,
  };
}

export async function fetchPublicXPost(
  url: string
): Promise<PublicXPostFetch> {
  const parsed = parseXStatusUrl(url);
  if (!parsed) {
    return { ok: false, error: "invalid_x_status_url" };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(
      `https://api.fxtwitter.com/${parsed.sourceAuthor}/status/${parsed.sourcePostId}`,
      {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      }
    );
    clearTimeout(timeout);
    if (!res.ok) {
      return {
        ok: false,
        error: "public_fetch_http",
        detail: `HTTP ${res.status}`,
      };
    }
    const json = (await res.json().catch(() => null)) as {
      tweet?: { text?: string; author?: { screen_name?: string } };
    } | null;
    const text = String(json?.tweet?.text ?? "").trim();
    if (!text) {
      return { ok: false, error: "public_fetch_empty" };
    }
    return {
      ok: true,
      sourceUrl: parsed.sourceUrl,
      sourcePostId: parsed.sourcePostId,
      sourceAuthor:
        String(json?.tweet?.author?.screen_name ?? parsed.sourceAuthor).trim() ||
        parsed.sourceAuthor,
      sourceBody: text.slice(0, 2000),
      source: "fxtwitter",
    };
  } catch (e: unknown) {
    return {
      ok: false,
      error: "public_fetch_failed",
      detail: e instanceof Error ? e.message : "fetch_error",
    };
  }
}
