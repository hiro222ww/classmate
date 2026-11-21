/**
 * Minimal Discord incoming-webhook sender for marketing ops digests.
 * Never logs the webhook URL.
 */

export type DiscordWebhookResult =
  | { ok: true }
  | { ok: false; error: string };

export function isDiscordWebhookConfigured(url: string): boolean {
  const u = String(url ?? "").trim();
  return /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//i.test(u);
}

export async function sendDiscordWebhookMessage(params: {
  webhookUrl: string;
  content: string;
}): Promise<DiscordWebhookResult> {
  const webhookUrl = String(params.webhookUrl ?? "").trim();
  if (!isDiscordWebhookConfigured(webhookUrl)) {
    return { ok: false, error: "discord_webhook_invalid" };
  }

  const content = String(params.content ?? "").trim();
  if (!content) return { ok: false, error: "discord_content_empty" };

  // Discord hard limit ~2000 chars
  const body = content.length > 1900 ? `${content.slice(0, 1890)}\n…` : content;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: body }),
    });
    if (!res.ok) {
      return { ok: false, error: `discord_http_${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "discord_send_failed",
    };
  }
}
