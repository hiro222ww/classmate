/**
 * Shared online / in_call / offline UI bucket.
 * Home, room (waiting), and call participation pills should use this.
 */

/** Shared UI bucket for home / room / waiting / call participation pills. */
export type PresenceBucket = "in_call" | "online" | "offline";

/**
 * Unified freshness window for online/in_call UI.
 * Must stay above background heartbeat (room/call ~30s) to avoid false offline.
 */
export const PRESENCE_ONLINE_FRESH_MS = 45_000;

/** Brief stale window that keeps the previous bucket to avoid reload flicker. */
export const PRESENCE_HANDOFF_GRACE_MS = 20_000;

export type ResolvePresenceBucketInput = {
  last_seen_at?: string | null;
  is_in_call?: boolean | null;
  screen?: string | null;
  effective_status?: string | null;
  presenceSessionId?: string | null;
  currentSessionId?: string | null;
  freshMs?: number;
  nowMs?: number;
  /** Previous UI bucket — brief stale handoff keeps this to avoid reload flicker. */
  previousBucket?: PresenceBucket | null;
  /** Explicit leave / local exit — never treat as in_call. */
  explicitLeave?: boolean;
};

export type ResolvePresenceBucketResult = {
  bucket: PresenceBucket;
  reason: string;
  fresh: boolean;
  stale: boolean;
};

function parseTs(value?: string | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

function presenceSessionAligned(input: ResolvePresenceBucketInput): boolean {
  const current = String(input.currentSessionId ?? "").trim();
  const presence = String(input.presenceSessionId ?? "").trim();
  if (!current || !presence) return true;
  return current === presence;
}

function isInCallCandidate(input: ResolvePresenceBucketInput): boolean {
  if (input.explicitLeave === true) return false;
  if (input.is_in_call !== true) return false;
  if (!presenceSessionAligned(input)) return false;

  const screen = String(input.screen ?? "").trim();
  // Fresh waiting-room / home presence wins over a lagged is_in_call flag.
  if (screen === "room" || screen === "home") return false;

  const effective = String(input.effective_status ?? "")
    .trim()
    .toLowerCase();
  if (screen === "call") return true;
  if (effective === "calling" || effective === "call") return true;
  return false;
}

/**
 * Source of truth for online / in_call / offline display.
 *
 * - online: fresh presence (last_seen within timeout)
 * - in_call: online + is_in_call + session-aligned + not room/home screen
 * - offline: no presence or stale last_seen
 *
 * Membership alone never makes a user online.
 */
export function getMemberPresenceStatus(
  input: ResolvePresenceBucketInput
): PresenceBucket {
  return resolvePresenceBucket(input).bucket;
}

export function resolvePresenceBucket(
  input: ResolvePresenceBucketInput
): ResolvePresenceBucketResult {
  const nowMs = input.nowMs ?? Date.now();
  const freshMs = input.freshMs ?? PRESENCE_ONLINE_FRESH_MS;
  const lastSeen = parseTs(input.last_seen_at);
  const fresh = lastSeen != null && nowMs - lastSeen <= freshMs;
  const stale = lastSeen != null && !fresh;

  if (fresh) {
    if (isInCallCandidate(input)) {
      return {
        bucket: "in_call",
        reason: "fresh_in_call",
        fresh: true,
        stale: false,
      };
    }
    return {
      bucket: "online",
      reason: "fresh_presence",
      fresh: true,
      stale: false,
    };
  }

  const previous = input.previousBucket ?? null;
  if (
    previous &&
    previous !== "offline" &&
    lastSeen != null &&
    nowMs - lastSeen <= freshMs + PRESENCE_HANDOFF_GRACE_MS
  ) {
    return {
      bucket: previous,
      reason: "presence_handoff_grace",
      fresh: false,
      stale: true,
    };
  }

  return {
    bucket: "offline",
    reason: lastSeen == null ? "no_presence" : "presence_stale",
    fresh: false,
    stale,
  };
}

export type PresenceMergeInput = {
  is_in_call?: boolean | null;
  screen?: string | null;
  last_seen_at?: string | null;
  session_id?: string | null;
  presence_session_id?: string | null;
  effective_status?: string | null;
  status?: string | null;
};

/**
 * Merge session-member row + presence row without inventing online.
 * Prefers the side with the newer last_seen for screen / is_in_call / last_seen.
 */
export function mergePresenceSources(
  member?: PresenceMergeInput | null,
  presence?: PresenceMergeInput | null
): PresenceMergeInput {
  const memberTs = parseTs(member?.last_seen_at) ?? -1;
  const presenceTs = parseTs(presence?.last_seen_at) ?? -1;
  const presenceNewer = presenceTs >= 0 && presenceTs >= memberTs;

  const memberScreen = String(member?.screen ?? "").trim() || null;
  const presenceScreen = String(presence?.screen ?? "").trim() || null;

  let screen: string | null;
  if (presenceNewer) {
    screen = presenceScreen ?? memberScreen;
  } else if (!memberScreen || memberScreen === "offline") {
    screen = presenceScreen ?? memberScreen;
  } else {
    screen = memberScreen;
  }

  let is_in_call: boolean | null | undefined;
  if (presenceNewer) {
    if (presence?.is_in_call === true) is_in_call = true;
    else if (presence?.is_in_call === false) is_in_call = false;
    else is_in_call = member?.is_in_call;
  } else if (member?.is_in_call === true) {
    is_in_call = true;
  } else {
    is_in_call = presence?.is_in_call ?? member?.is_in_call;
  }

  const last_seen_at =
    presenceTs >= memberTs
      ? presence?.last_seen_at ?? member?.last_seen_at ?? null
      : member?.last_seen_at ?? presence?.last_seen_at ?? null;

  return {
    is_in_call,
    screen,
    last_seen_at,
    session_id: presence?.session_id ?? member?.session_id ?? null,
    presence_session_id:
      member?.presence_session_id ??
      presence?.presence_session_id ??
      presence?.session_id ??
      null,
    effective_status: presence?.effective_status ?? presence?.status ?? null,
    status: presence?.status ?? null,
  };
}

/** Keep the newest last_seen row per device_id (drops older duplicate rows). */
export function pickLatestPresenceByDeviceId<
  T extends { device_id?: string | null; last_seen_at?: string | null },
>(rows: T[]): T[] {
  const byDevice = new Map<string, T>();
  for (const row of rows) {
    const did = String(row.device_id ?? "").trim();
    if (!did) continue;
    const prev = byDevice.get(did);
    if (!prev) {
      byDevice.set(did, row);
      continue;
    }
    const prevTs = parseTs(prev.last_seen_at) ?? 0;
    const nextTs = parseTs(row.last_seen_at) ?? 0;
    if (nextTs >= prevTs) byDevice.set(did, row);
  }
  return Array.from(byDevice.values());
}

export function presenceBucketFromInternal(
  internal:
    | "in_voice"
    | "connecting_voice"
    | "in_room"
    | "in_session"
    | "member_only"
    | "offline"
): PresenceBucket {
  if (internal === "in_voice") return "in_call";
  if (
    internal === "connecting_voice" ||
    internal === "in_room" ||
    internal === "in_session"
  ) {
    return "online";
  }
  return "offline";
}
