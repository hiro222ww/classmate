import { isExplicitMemberLeave } from "@/lib/memberStatus";
import { isDebugLogEnabled, logDebug } from "@/lib/debugLog";
import {
  isPresenceFresh,
  PRESENCE_FRESH_MS_HOME,
  PRESENCE_FRESH_MS_ROOM,
  type ParticipationSource,
} from "@/lib/memberPresenceStatus";
import { isStableVoiceJoinMode, STABLE_REMOTE_PEER_GRACE_MS } from "@/lib/stableVoiceJoin";

export const SESSION_MEMBER_PRESERVE_MS = isStableVoiceJoinMode()
  ? STABLE_REMOTE_PEER_GRACE_MS * 2
  : 60_000;

export type MemberListContext = "home" | "room" | "call";

type MemberRow = {
  device_id?: string | null;
  last_seen_at?: string | null;
  screen?: string | null;
  is_in_call?: boolean | null;
};

export function getPresenceFreshMsForContext(context: MemberListContext): number {
  if (context === "room") return PRESENCE_FRESH_MS_ROOM;
  return PRESENCE_FRESH_MS_HOME;
}

export function countPresenceStates(
  members: MemberRow[],
  freshMs: number
): { presenceActive: number; presenceStale: number } {
  let presenceActive = 0;
  let presenceStale = 0;

  for (const member of members) {
    if (isPresenceFresh(member.last_seen_at, freshMs)) {
      presenceActive += 1;
    } else if (member.last_seen_at) {
      presenceStale += 1;
    }
  }

  return { presenceActive, presenceStale };
}

const MEMBER_SOURCE_LOG_MIN_INTERVAL_MS = 3000;

const memberSourceLogState = new Map<
  MemberListContext,
  { key: string; atMs: number }
>();

export function logMemberSource(params: {
  context: MemberListContext;
  sessionMembers: number;
  presenceActive: number;
  presenceStale: number;
  displayMembers: number;
  sessionId?: string;
  displayMemberIds?: string[];
  extra?: string;
}) {
  const sessionTail = params.sessionId ? params.sessionId.slice(-6) : "-";
  const memberIds =
    params.displayMemberIds
      ?.map((id) => String(id ?? "").trim().slice(-4))
      .filter(Boolean)
      .sort()
      .join(",") ?? "-";
  const key =
    `${sessionTail}|${params.sessionMembers}|${params.displayMembers}|` +
    `${params.presenceActive}|${params.presenceStale}|${memberIds}|${params.extra ?? ""}`;
  const now = Date.now();
  const prev = memberSourceLogState.get(params.context);
  if (
    prev &&
    prev.key === key &&
    now - prev.atMs < MEMBER_SOURCE_LOG_MIN_INTERVAL_MS
  ) {
    return;
  }
  memberSourceLogState.set(params.context, { key, atMs: now });

  if (!isDebugLogEnabled()) return;
  logDebug(
    "members",
    `[member-source] context=${params.context} session=${sessionTail} ` +
      `sessionMembers=${params.sessionMembers} presenceActive=${params.presenceActive} ` +
      `presenceStale=${params.presenceStale} displayMembers=${params.displayMembers} ` +
      `memberIds=${memberIds}` +
      (params.extra ? ` ${params.extra}` : "")
  );
}

export function logMemberDropIgnored(params: {
  deviceId: string;
  reason: string;
  context?: MemberListContext;
}) {
  if (!isDebugLogEnabled()) return;
  logDebug(
    "members",
    `[member-drop] reason=${params.reason} device=${params.deviceId.slice(-4)}` +
      (params.context ? ` context=${params.context}` : "")
  );
}

export function logPresenceStaleKept(params: {
  deviceId: string;
  context: MemberListContext;
}) {
  if (!isDebugLogEnabled()) return;
  logDebug(
    "presence",
    `[presence] stale device=${params.deviceId.slice(-4)} keptInMembers=1 ` +
      `context=${params.context}`
  );
}

export function mergeSessionMembersPreservingRemoved<T extends MemberRow>(
  prev: T[],
  incoming: T[],
  opts: {
    sessionId: string;
    context: MemberListContext;
    explicitLeftIds?: ReadonlySet<string>;
    memberLastInListAt: Map<string, number>;
    nowMs?: number;
    preserveGraceMs?: number;
  }
): { merged: T[]; preservedIds: string[] } {
  const now = opts.nowMs ?? Date.now();
  const incomingIds = new Set(
    incoming.map((m) => String(m.device_id ?? "").trim()).filter(Boolean)
  );
  const prevById = new Map(
    prev.map((m) => [String(m.device_id ?? "").trim(), m] as const)
  );
  const merged = [...incoming];
  const preservedIds: string[] = [];

  for (const existing of prev) {
    const did = String(existing.device_id ?? "").trim();
    if (!did || incomingIds.has(did)) continue;

    if (isExplicitMemberLeave(opts.sessionId, did, opts.explicitLeftIds)) {
      if (isDebugLogEnabled()) {
        logDebug(
          "members",
          `[member-drop] reason=explicit_leave device=${did.slice(-4)} ` +
            `context=${opts.context}`
        );
      }
      continue;
    }

    merged.push(existing);
    preservedIds.push(did);
    logMemberDropIgnored({
      deviceId: did,
      reason: "presence_stale_ignored",
      context: opts.context,
    });
  }

  for (const member of incoming) {
    const did = String(member.device_id ?? "").trim();
    if (!did) continue;
    opts.memberLastInListAt.set(did, now);
  }

  return { merged, preservedIds };
}

export function participationSourceFromMember(
  member: MemberRow
): ParticipationSource {
  return {
    is_in_call: member.is_in_call === true,
    screen: member.screen ?? null,
    last_seen_at: member.last_seen_at ?? null,
  };
}
