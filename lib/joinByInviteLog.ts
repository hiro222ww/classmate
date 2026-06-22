import { tailJoinId } from "@/lib/joinStateInvariants";

export type InviteJoinLogContext = {
  requestId: string;
  classId?: string;
  sessionId?: string;
  requestedSessionId?: string;
  deviceId?: string;
  userId?: string | null;
  hasProfile?: boolean;
  inviteValid?: boolean | null;
  existingMembership?: boolean | null;
  ageGuardOk?: boolean | null;
  classSlotsOk?: boolean | null;
  upsertOk?: boolean | null;
  code?: string;
  action?: string | null;
  supabaseCode?: string | null;
  supabaseMessage?: string | null;
  supabaseDetails?: string | null;
  supabaseHint?: string | null;
  step?: string;
  detail?: string | null;
};

function tail(value?: string | null) {
  return tailJoinId(String(value ?? ""));
}

export function logInviteJoinServer(
  event: "start" | "step" | "success" | "failed",
  ctx: InviteJoinLogContext
) {
  const parts = [
    `[invite-join] ${event}`,
    `requestId=${ctx.requestId}`,
    ctx.step ? `step=${ctx.step}` : null,
    ctx.classId ? `class=${tail(ctx.classId)}` : null,
    ctx.sessionId ? `session=${tail(ctx.sessionId)}` : null,
    ctx.requestedSessionId
      ? `requested=${tail(ctx.requestedSessionId)}`
      : null,
    ctx.deviceId ? `device=${tail(ctx.deviceId)}` : null,
    ctx.userId ? `userId=${ctx.userId}` : ctx.userId === null ? "userId=-" : null,
    ctx.hasProfile != null ? `profile=${ctx.hasProfile ? 1 : 0}` : null,
    ctx.inviteValid != null ? `inviteValid=${ctx.inviteValid ? 1 : 0}` : null,
    ctx.existingMembership != null
      ? `existingMember=${ctx.existingMembership ? 1 : 0}`
      : null,
    ctx.ageGuardOk != null ? `ageOk=${ctx.ageGuardOk ? 1 : 0}` : null,
    ctx.classSlotsOk != null ? `slotsOk=${ctx.classSlotsOk ? 1 : 0}` : null,
    ctx.upsertOk != null ? `upsertOk=${ctx.upsertOk ? 1 : 0}` : null,
    ctx.code ? `code=${ctx.code}` : null,
    ctx.action ? `action=${ctx.action}` : null,
    ctx.supabaseCode ? `pgCode=${ctx.supabaseCode}` : null,
    ctx.supabaseMessage ? `pgMessage=${ctx.supabaseMessage}` : null,
    ctx.supabaseDetails ? `pgDetails=${ctx.supabaseDetails}` : null,
    ctx.supabaseHint ? `pgHint=${ctx.supabaseHint}` : null,
    ctx.detail ? `detail=${ctx.detail}` : null,
  ].filter(Boolean);

  const line = parts.join(" ");
  if (event === "failed") {
    console.warn(line);
    return;
  }
  console.log(line);
}
