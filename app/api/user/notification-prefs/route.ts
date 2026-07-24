import { NextResponse } from "next/server";
import { resolveApiActor } from "@/lib/actorIdentity";
import {
  defaultNotificationPrefs,
  getOrCreateNotificationPrefs,
  updateNotificationPrefs,
} from "@/lib/emailNotificationPrefs";
import { isTransactionalEmailConfigured } from "@/lib/emailSender";
import { isValidUuid } from "@/lib/userIdentity";

export const dynamic = "force-dynamic";

function toPublicPrefs(row: {
  email_enabled: boolean;
  email_call_request: boolean;
  email_meeting_plan: boolean;
}) {
  return {
    emailEnabled: row.email_enabled,
    emailCallRequest: row.email_call_request,
    emailMeetingPlan: row.email_meeting_plan,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const deviceId = searchParams.get("deviceId");

  const actorResult = await resolveApiActor({ req, deviceId });
  if (!actorResult.ok) {
    return NextResponse.json(
      { error: actorResult.error, message: actorResult.message },
      { status: actorResult.status }
    );
  }

  const userId = String(actorResult.actor.userId ?? "").trim();
  if (!isValidUuid(userId)) {
    return NextResponse.json({
      ok: true,
      configured: isTransactionalEmailConfigured(),
      hasLinkedAccount: false,
      prefs: toPublicPrefs(defaultNotificationPrefs("")),
    });
  }

  const prefs = await getOrCreateNotificationPrefs(userId);
  if (!prefs) {
    return NextResponse.json(
      { error: "prefs_lookup_failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    configured: isTransactionalEmailConfigured(),
    hasLinkedAccount: true,
    prefs: toPublicPrefs(prefs),
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const actorResult = await resolveApiActor({
    req,
    deviceId: body.deviceId,
  });

  if (!actorResult.ok) {
    return NextResponse.json(
      { error: actorResult.error, message: actorResult.message },
      { status: actorResult.status }
    );
  }

  const userId = String(actorResult.actor.userId ?? "").trim();
  if (!isValidUuid(userId)) {
    return NextResponse.json(
      {
        error: "login_required",
        message: "メール通知は Google ログイン後に設定できます。",
      },
      { status: 403 }
    );
  }

  if (
    body.emailEnabled === true &&
    !String(actorResult.actor.email ?? "").trim()
  ) {
    return NextResponse.json(
      {
        error: "email_required",
        message: "メールアドレスが取得できないため、通知を有効にできません。",
      },
      { status: 400 }
    );
  }

  const updated = await updateNotificationPrefs({
    userId,
    emailEnabled:
      typeof body.emailEnabled === "boolean" ? body.emailEnabled : undefined,
    emailCallRequest:
      typeof body.emailCallRequest === "boolean"
        ? body.emailCallRequest
        : undefined,
    emailMeetingPlan:
      typeof body.emailMeetingPlan === "boolean"
        ? body.emailMeetingPlan
        : undefined,
  });

  if (!updated) {
    return NextResponse.json({ error: "prefs_update_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    configured: isTransactionalEmailConfigured(),
    hasLinkedAccount: true,
    prefs: toPublicPrefs(updated),
  });
}
