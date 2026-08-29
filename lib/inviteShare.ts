/**
 * Share an invite URL via Web Share API when available; otherwise copy to clipboard.
 */

export type InviteShareResult =
  | { ok: true; method: "share" | "clipboard" | "prompt" }
  | { ok: false; method: "none"; error?: string };

export function canUseWebShare(url?: string): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare === "function" && url) {
    try {
      return navigator.canShare({ url, title: "Classmate", text: "通話に参加しませんか？" });
    } catch {
      return true;
    }
  }
  return true;
}

export async function shareOrCopyInviteUrl(params: {
  url: string;
  title?: string;
  text?: string;
}): Promise<InviteShareResult> {
  const url = String(params.url ?? "").trim();
  if (!url) {
    return { ok: false, method: "none", error: "missing_url" };
  }

  const title = String(params.title ?? "Classmate").trim() || "Classmate";
  const text =
    String(params.text ?? "通話に参加しませんか？").trim() ||
    "通話に参加しませんか？";

  if (canUseWebShare(url)) {
    try {
      await navigator.share({ title, text, url });
      return { ok: true, method: "share" };
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      // User dismissed the share sheet — not a failure worth falling back loudly.
      if (name === "AbortError") {
        return { ok: true, method: "share" };
      }
      // Fall through to clipboard.
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return { ok: true, method: "clipboard" };
  } catch {
    // last resort for older WebViews
    try {
      if (typeof window !== "undefined") {
        window.prompt(
          "コピーできませんでした。下のリンクをコピーしてください。",
          url
        );
        return { ok: true, method: "prompt" };
      }
    } catch {
      // ignore
    }
    return { ok: false, method: "none", error: "copy_failed" };
  }
}
