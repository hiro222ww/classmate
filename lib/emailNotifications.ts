import { buildAppUrl } from "@/lib/appOrigin";
import {
  emailSubjectForEventType,
  isEmailNotificationEventType,
} from "@/lib/emailNotificationConstraints";
import {
  getOrCreateNotificationPrefs,
  prefsAllowEvent,
} from "@/lib/emailNotificationPrefs";
import { sendTransactionalEmail } from "@/lib/emailSender";
import { formatInAppToastMessage } from "@/lib/notificationFeed";
import {
  NOTIFICATION_EVENT_TYPES,
  type NotificationEventRow,
} from "@/lib/notificationEvents";
import { normalizeMeetingDeviceId } from "@/lib/meetingPlan";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isValidUuid } from "@/lib/userIdentity";

type EmailRecipient = {
  userId: string;
  email: string;
  unsubscribeToken: string;
};

async function markEmailSent(eventId: string) {
  await supabaseAdmin
    .from("notification_events")
    .update({
      email_sent_at: new Date().toISOString(),
      email_skipped_reason: null,
    })
    .eq("id", eventId);
}

async function markEmailSkipped(eventId: string, reason: string) {
  await supabaseAdmin
    .from("notification_events")
    .update({ email_skipped_reason: reason })
    .eq("id", eventId);
}

async function resolveUserIdForDevice(deviceId: string): Promise<string | null> {
  const id = normalizeMeetingDeviceId(deviceId);
  if (!id) return null;

  const { data } = await supabaseAdmin
    .from("user_devices")
    .select("user_id")
    .eq("device_id", id)
    .maybeSingle();

  const userId = String((data as { user_id?: string } | null)?.user_id ?? "").trim();
  return isValidUuid(userId) ? userId : null;
}

async function loadAuthEmail(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !data?.user) return null;
    if (data.user.is_anonymous) return null;
    const email = String(data.user.email ?? "").trim().toLowerCase();
    return email.includes("@") ? email : null;
  } catch {
    return null;
  }
}

async function loadClassTitle(classId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("classes")
    .select("name")
    .eq("id", classId)
    .maybeSingle();

  return String((data as { name?: string } | null)?.name ?? "").trim() || "クラス";
}

export async function loadEmailRecipientsForClass(params: {
  classId: string;
  actorDeviceId: string;
  eventType: string;
}): Promise<EmailRecipient[]> {
  const classId = String(params.classId ?? "").trim();
  const actorDeviceId = normalizeMeetingDeviceId(params.actorDeviceId);
  if (!classId || !actorDeviceId) return [];

  const { data: memberships, error } = await supabaseAdmin
    .from("class_memberships")
    .select("device_id, user_id")
    .eq("class_id", classId);

  if (error || !memberships) return [];

  const recipients: EmailRecipient[] = [];
  const seenUsers = new Set<string>();
  const seenEmails = new Set<string>();

  for (const row of memberships) {
    const deviceId = normalizeMeetingDeviceId(
      (row as { device_id?: string }).device_id
    );
    if (!deviceId || deviceId === actorDeviceId) continue;

    let userId = String((row as { user_id?: string | null }).user_id ?? "").trim();
    if (!isValidUuid(userId)) {
      userId = (await resolveUserIdForDevice(deviceId)) ?? "";
    }
    if (!isValidUuid(userId) || seenUsers.has(userId)) continue;
    seenUsers.add(userId);

    const prefs = await getOrCreateNotificationPrefs(userId);
    if (!prefs || !prefsAllowEvent(prefs, params.eventType)) continue;

    const email = await loadAuthEmail(userId);
    if (!email || seenEmails.has(email)) continue;
    seenEmails.add(email);

    recipients.push({
      userId,
      email,
      unsubscribeToken: prefs.unsubscribe_token,
    });
  }

  return recipients;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEmailBodies(params: {
  event: NotificationEventRow;
  classTitle: string;
  openUrl: string;
  unsubscribeUrl: string;
}) {
  const body = formatInAppToastMessage({
    event_type: params.event.event_type,
    message: params.event.message,
    payload: params.event.payload,
  });

  const subject = emailSubjectForEventType(params.event.event_type);
  const text = [
    body,
    "",
    `クラス: ${params.classTitle}`,
    `開く: ${params.openUrl}`,
    "",
    `メール通知の停止: ${params.unsubscribeUrl}`,
  ].join("\n");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.6;color:#111827;">
      <p style="font-size:16px;font-weight:700;margin:0 0 12px;">${escapeHtml(body)}</p>
      <p style="margin:0 0 16px;color:#4b5563;">クラス: ${escapeHtml(params.classTitle)}</p>
      <p style="margin:0 0 24px;">
        <a href="${escapeHtml(params.openUrl)}" style="display:inline-block;padding:12px 16px;background:#111827;color:#fff;border-radius:10px;text-decoration:none;font-weight:700;">
          Classmateを開く
        </a>
      </p>
      <p style="margin:0;font-size:12px;color:#9ca3af;">
        このメールはオプトインした方にのみ送信しています。<br/>
        <a href="${escapeHtml(params.unsubscribeUrl)}" style="color:#6b7280;">メール通知を停止する</a>
      </p>
    </div>
  `.trim();

  return { subject, text, html };
}

export async function dispatchNotificationEmail(eventId: string) {
  const normalizedEventId = String(eventId ?? "").trim();
  if (!normalizedEventId) {
    return { ok: false as const, error: "event_id_missing" };
  }

  const { data: event, error: eventErr } = await supabaseAdmin
    .from("notification_events")
    .select(
      "id, event_type, class_id, actor_device_id, message, payload, created_at, expires_at, email_sent_at"
    )
    .eq("id", normalizedEventId)
    .maybeSingle();

  if (eventErr || !event) {
    await markEmailSkipped(normalizedEventId, "event_not_found");
    return { ok: false as const, error: "event_not_found" };
  }

  const row = event as NotificationEventRow & {
    email_sent_at?: string | null;
  };

  if (!isEmailNotificationEventType(row.event_type)) {
    await markEmailSkipped(normalizedEventId, "email_event_type_skipped");
    return { ok: false as const, error: "email_event_type_skipped" };
  }

  if (row.email_sent_at) {
    return { ok: true as const, skipped: true, reason: "already_sent" };
  }

  if (
    row.event_type === NOTIFICATION_EVENT_TYPES.CALL_REQUEST_CREATED &&
    row.expires_at &&
    Date.parse(row.expires_at) <= Date.now()
  ) {
    await markEmailSkipped(normalizedEventId, "event_expired");
    return { ok: true as const, skipped: true, reason: "event_expired" };
  }

  const classId = String(row.class_id ?? "").trim();
  const actorDeviceId = normalizeMeetingDeviceId(row.actor_device_id);
  if (!classId || !actorDeviceId) {
    await markEmailSkipped(normalizedEventId, "invalid_event");
    return { ok: false as const, error: "invalid_event" };
  }

  const recipients = await loadEmailRecipientsForClass({
    classId,
    actorDeviceId,
    eventType: row.event_type,
  });

  if (recipients.length === 0) {
    await markEmailSkipped(normalizedEventId, "no_email_recipients");
    return { ok: true as const, skipped: true, reason: "no_email_recipients" };
  }

  const classTitle = await loadClassTitle(classId);
  const openUrl = buildAppUrl(`/?pushOpenClassId=${encodeURIComponent(classId)}`);

  let sentCount = 0;
  let failedCount = 0;

  for (const recipient of recipients) {
    const unsubscribeUrl = buildAppUrl(
      `/api/notifications/email-unsubscribe?token=${encodeURIComponent(recipient.unsubscribeToken)}`
    );
    const bodies = buildEmailBodies({
      event: row,
      classTitle,
      openUrl,
      unsubscribeUrl,
    });

    const result = await sendTransactionalEmail({
      to: recipient.email,
      subject: bodies.subject,
      html: bodies.html,
      text: bodies.text,
    });

    if (result.ok) {
      sentCount += 1;
    } else {
      failedCount += 1;
      if (result.error === "email_not_configured") {
        await markEmailSkipped(normalizedEventId, "email_not_configured");
        return { ok: false as const, error: "email_not_configured" };
      }
      console.warn("[emailNotifications] send failed", {
        userId: recipient.userId,
        error: result.error,
      });
    }
  }

  if (sentCount > 0) {
    await markEmailSent(normalizedEventId);
    return { ok: true as const, sentCount, failedCount };
  }

  await markEmailSkipped(normalizedEventId, "send_failed");
  return { ok: false as const, error: "send_failed", failedCount };
}
