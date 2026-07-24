export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type SendEmailResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

function getEmailConfig() {
  const apiKey = String(process.env.RESEND_API_KEY ?? "").trim();
  const from = String(
    process.env.EMAIL_FROM ?? process.env.RESEND_FROM ?? ""
  ).trim();
  const replyTo = String(process.env.EMAIL_REPLY_TO ?? "").trim() || null;

  if (!apiKey || !from) return null;
  return { apiKey, from, replyTo };
}

export function isTransactionalEmailConfigured() {
  return getEmailConfig() != null;
}

/**
 * Send via Resend HTTP API (no SDK dependency).
 * Fails closed when env is missing.
 */
export async function sendTransactionalEmail(
  input: SendEmailInput
): Promise<SendEmailResult> {
  const config = getEmailConfig();
  if (!config) {
    return { ok: false, error: "email_not_configured" };
  }

  const to = String(input.to ?? "").trim().toLowerCase();
  if (!to || !to.includes("@")) {
    return { ok: false, error: "invalid_recipient" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: [to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(config.replyTo ? { reply_to: config.replyTo } : {}),
      }),
    });

    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      error?: { message?: string };
    };

    if (!res.ok) {
      return {
        ok: false,
        error: String(
          json.error?.message ?? json.message ?? `resend_http_${res.status}`
        ),
      };
    }

    return { ok: true, id: json.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "email_send_failed",
    };
  }
}
