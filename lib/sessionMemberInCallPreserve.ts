/**
 * session_members.is_in_call SoT:
 * - false on new INSERT (not yet in call)
 * - membership ensure / join / repair must not demote existing true → false
 * - only explicit call leave (e.g. CallClient.markSelfLeftCall) may clear it
 */

export type SessionMemberEnsureInCallDecision =
  | {
      /** Include is_in_call in the upsert payload. */
      writeIsInCall: true;
      isInCall: false;
      /** Emit [session-in-call] write is_in_call=false for insert default. */
      logFalseWrite: true;
    }
  | {
      /** Omit is_in_call so Postgres/PostgREST leave the existing column alone. */
      writeIsInCall: false;
      logFalseWrite: false;
    };

/**
 * Ensure / join membership upsert must preserve call state on existing rows.
 */
export function decideSessionMemberEnsureInCall(params: {
  existingRow: boolean;
}): SessionMemberEnsureInCallDecision {
  if (!params.existingRow) {
    return {
      writeIsInCall: true,
      isInCall: false,
      logFalseWrite: true,
    };
  }
  return {
    writeIsInCall: false,
    logFalseWrite: false,
  };
}

/**
 * Expected ON CONFLICT UPDATE for match_join_atomic_v3 session_members upsert.
 * Must not assign is_in_call = false (preserve existing call state).
 */
export const MATCH_JOIN_SESSION_MEMBER_CONFLICT_UPDATE_SQL = [
  "display_name = EXCLUDED.display_name",
  "joined_at = EXCLUDED.joined_at",
  "user_id = COALESCE(sm.user_id, EXCLUDED.user_id)",
].join(", ");

export function matchJoinConflictPreservesIsInCall(
  onConflictUpdateSql: string
): boolean {
  const normalized = onConflictUpdateSql.replace(/\s+/g, " ").toLowerCase();
  if (normalized.includes("is_in_call = false")) return false;
  if (normalized.includes("is_in_call=false")) return false;
  if (normalized.includes("is_in_call = excluded.is_in_call")) return false;
  return true;
}
