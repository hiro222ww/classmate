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

export type NotificationPrefsResult =
  | { ok: true; prefs: UserNotificationPrefs }
  | { ok: false; error: string; detail: string };

function prefsFailure(error: string, detail: string): NotificationPrefsResult {
  console.warn(`[emailPrefs] ${error}`, detail);
  return { ok: false, error, detail };
}

function isMissingRelationError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("user_notification_prefs") &&
    (m.includes("schema cache") ||
      m.includes("does not exist") ||
      m.includes("could not find the table"))
  );
}

export async function getOrCreateNotificationPrefs(
  userId: string
): Promise<NotificationPrefsResult> {
  const normalized = String(userId ?? "").trim();
  if (!normalized) {
    return prefsFailure("invalid_user_id", "user_id_missing");
  }

  const { data: existing, error: readErr } = await supabaseAdmin
    .from("user_notification_prefs")
    .select(
      "user_id, email_enabled, email_call_request, email_meeting_plan, unsubscribe_token, updated_at, created_at"
    )
    .eq("user_id", normalized)
    .maybeSingle();

  if (readErr) {
    if (isMissingRelationError(readErr.message)) {
      return prefsFailure(
        "migration_required",
        "user_notification_prefs table is missing. Apply supabase/migrations/20260724140000_email_notification_prefs.sql"
      );
    }
    return prefsFailure("prefs_lookup_failed", readErr.message);
  }

  if (existing) {
    return { ok: true, prefs: existing as UserNotificationPrefs };
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
    const { data: again, error: againErr } = await supabaseAdmin
      .from("user_notification_prefs")
      .select(
        "user_id, email_enabled, email_call_request, email_meeting_plan, unsubscribe_token, updated_at, created_at"
      )
      .eq("user_id", normalized)
      .maybeSingle();
    if (again) {
      return { ok: true, prefs: again as UserNotificationPrefs };
    }
    if (isMissingRelationError(insertErr.message)) {
      return prefsFailure(
        "migration_required",
        "user_notification_prefs table is missing. Apply supabase/migrations/20260724140000_email_notification_prefs.sql"
      );
    }
    return prefsFailure(
      "prefs_create_failed",
      againErr?.message || insertErr.message
    );
  }

  return { ok: true, prefs: inserted as UserNotificationPrefs };
}

export async function updateNotificationPrefs(input: {
  userId: string;
  emailEnabled?: boolean;
  emailCallRequest?: boolean;
  emailMeetingPlan?: boolean;
}): Promise<NotificationPrefsResult> {
  const current = await getOrCreateNotificationPrefs(input.userId);
  if (!current.ok) return current;

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
    if (isMissingRelationError(error.message)) {
      return prefsFailure(
        "migration_required",
        "user_notification_prefs table is missing. Apply supabase/migrations/20260724140000_email_notification_prefs.sql"
      );
    }
    return prefsFailure("prefs_update_failed", error.message);
  }

  return { ok: true, prefs: data as UserNotificationPrefs };
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
