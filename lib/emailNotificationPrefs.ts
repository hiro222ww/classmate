import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type UserNotificationPrefs = {
  user_id: string;
  email_enabled: boolean;
  email_call_request: boolean;
  email_meeting_plan: boolean;
  unsubscribe_token: string;
  updated_at: string;
  created_at: string;
};

export function defaultNotificationPrefs(userId: string): UserNotificationPrefs {
  const now = new Date().toISOString();
  return {
    user_id: userId,
    email_enabled: false,
    email_call_request: true,
    email_meeting_plan: true,
    unsubscribe_token: "",
    updated_at: now,
    created_at: now,
  };
}

function newUnsubscribeToken() {
  return randomBytes(24).toString("hex");
}

export async function getOrCreateNotificationPrefs(
  userId: string
): Promise<UserNotificationPrefs | null> {
  const normalized = String(userId ?? "").trim();
  if (!normalized) return null;

  const { data: existing, error: readErr } = await supabaseAdmin
    .from("user_notification_prefs")
    .select(
      "user_id, email_enabled, email_call_request, email_meeting_plan, unsubscribe_token, updated_at, created_at"
    )
    .eq("user_id", normalized)
    .maybeSingle();

  if (readErr) {
    console.warn("[emailPrefs] read failed", readErr.message);
    return null;
  }

  if (existing) {
    return existing as UserNotificationPrefs;
  }

  const token = newUnsubscribeToken();
  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from("user_notification_prefs")
    .insert({
      user_id: normalized,
      email_enabled: false,
      email_call_request: true,
      email_meeting_plan: true,
      unsubscribe_token: token,
    })
    .select(
      "user_id, email_enabled, email_call_request, email_meeting_plan, unsubscribe_token, updated_at, created_at"
    )
    .single();

  if (insertErr) {
    // Race: another request inserted
    const { data: again } = await supabaseAdmin
      .from("user_notification_prefs")
      .select(
        "user_id, email_enabled, email_call_request, email_meeting_plan, unsubscribe_token, updated_at, created_at"
      )
      .eq("user_id", normalized)
      .maybeSingle();
    return (again as UserNotificationPrefs | null) ?? null;
  }

  return inserted as UserNotificationPrefs;
}

export async function updateNotificationPrefs(input: {
  userId: string;
  emailEnabled?: boolean;
  emailCallRequest?: boolean;
  emailMeetingPlan?: boolean;
}): Promise<UserNotificationPrefs | null> {
  const current = await getOrCreateNotificationPrefs(input.userId);
  if (!current) return null;

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof input.emailEnabled === "boolean") {
    patch.email_enabled = input.emailEnabled;
  }
  if (typeof input.emailCallRequest === "boolean") {
    patch.email_call_request = input.emailCallRequest;
  }
  if (typeof input.emailMeetingPlan === "boolean") {
    patch.email_meeting_plan = input.emailMeetingPlan;
  }

  const { data, error } = await supabaseAdmin
    .from("user_notification_prefs")
    .update(patch)
    .eq("user_id", input.userId)
    .select(
      "user_id, email_enabled, email_call_request, email_meeting_plan, unsubscribe_token, updated_at, created_at"
    )
    .single();

  if (error) {
    console.warn("[emailPrefs] update failed", error.message);
    return null;
  }

  return data as UserNotificationPrefs;
}

export async function disableEmailByUnsubscribeToken(
  token: string
): Promise<{ ok: boolean; alreadyDisabled?: boolean }> {
  const normalized = String(token ?? "").trim();
  if (!normalized) return { ok: false };

  const { data, error } = await supabaseAdmin
    .from("user_notification_prefs")
    .select("user_id, email_enabled")
    .eq("unsubscribe_token", normalized)
    .maybeSingle();

  if (error || !data) return { ok: false };

  if ((data as { email_enabled?: boolean }).email_enabled !== true) {
    return { ok: true, alreadyDisabled: true };
  }

  const { error: updateErr } = await supabaseAdmin
    .from("user_notification_prefs")
    .update({
      email_enabled: false,
      updated_at: new Date().toISOString(),
    })
    .eq("unsubscribe_token", normalized);

  if (updateErr) return { ok: false };
  return { ok: true };
}

export function prefsAllowEvent(
  prefs: Pick<
    UserNotificationPrefs,
    "email_enabled" | "email_call_request" | "email_meeting_plan"
  >,
  eventType: string
): boolean {
  if (!prefs.email_enabled) return false;
  if (eventType === "call_request_created") return prefs.email_call_request;
  if (
    eventType === "meeting_plan_created" ||
    eventType === "meeting_plan_updated"
  ) {
    return prefs.email_meeting_plan;
  }
  return false;
}
