import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decideSessionMemberEnsureInCall,
  MATCH_JOIN_SESSION_MEMBER_CONFLICT_UPDATE_SQL,
  matchJoinConflictPreservesIsInCall,
} from "@/lib/sessionMemberInCallPreserve";

/** Mirrors ensureClassSessionMembership session_members payload construction. */
function buildEnsureSessionMemberPayload(params: {
  existingRow: boolean;
  sessionId: string;
  deviceId: string;
}) {
  const decision = decideSessionMemberEnsureInCall({
    existingRow: params.existingRow,
  });
  const payload: Record<string, unknown> = {
    session_id: params.sessionId,
    device_id: params.deviceId,
    display_name: "参加者",
    joined_at: "2026-01-01T00:00:00.000Z",
  };
  if (decision.writeIsInCall) {
    payload.is_in_call = decision.isInCall;
  }
  return { payload, decision };
}

describe("decideSessionMemberEnsureInCall", () => {
  it("new session member → write is_in_call=false", () => {
    expect(decideSessionMemberEnsureInCall({ existingRow: false })).toEqual({
      writeIsInCall: true,
      isInCall: false,
      logFalseWrite: true,
    });
  });

  it("existing false + ensure → omit is_in_call (preserve false)", () => {
    expect(decideSessionMemberEnsureInCall({ existingRow: true })).toEqual({
      writeIsInCall: false,
      logFalseWrite: false,
    });
  });

  it("existing true + ensure → omit is_in_call (preserve true)", () => {
    expect(
      decideSessionMemberEnsureInCall({ existingRow: true }).writeIsInCall
    ).toBe(false);
  });

  it("rejoin loop: ensure never demotes after in-call true", () => {
    for (let i = 0; i < 5; i += 1) {
      expect(
        decideSessionMemberEnsureInCall({ existingRow: true }).writeIsInCall
      ).toBe(false);
    }
  });
});

describe("ensure session_members is_in_call preserve (payload)", () => {
  it("new member payload includes is_in_call=false", () => {
    const { payload, decision } = buildEnsureSessionMemberPayload({
      existingRow: false,
      sessionId: "s1",
      deviceId: "d1",
    });
    expect(payload.is_in_call).toBe(false);
    expect(decision.logFalseWrite).toBe(true);
  });

  it("existing false + ensure omits is_in_call", () => {
    const { payload, decision } = buildEnsureSessionMemberPayload({
      existingRow: true,
      sessionId: "s1",
      deviceId: "d1",
    });
    expect(payload).not.toHaveProperty("is_in_call");
    expect(decision.logFalseWrite).toBe(false);
  });

  it("existing true + ensure omits is_in_call", () => {
    const { payload } = buildEnsureSessionMemberPayload({
      existingRow: true,
      sessionId: "s1",
      deviceId: "d1",
    });
    expect(payload).not.toHaveProperty("is_in_call");
  });

  it("leave then ensure: existing row still omits is_in_call", () => {
    const { payload, decision } = buildEnsureSessionMemberPayload({
      existingRow: true,
      sessionId: "s1",
      deviceId: "d1",
    });
    expect(payload).not.toHaveProperty("is_in_call");
    expect(decision.logFalseWrite).toBe(false);
  });

  it("rejoin true then repeated ensure never writes false", () => {
    for (let i = 0; i < 5; i += 1) {
      const { payload } = buildEnsureSessionMemberPayload({
        existingRow: true,
        sessionId: "s1",
        deviceId: "d1",
      });
      expect(payload).not.toHaveProperty("is_in_call");
    }
  });
});

describe("match_join_atomic_v3 conflict clause", () => {
  it("ON CONFLICT UPDATE preserves is_in_call (does not set false)", () => {
    expect(
      matchJoinConflictPreservesIsInCall(
        MATCH_JOIN_SESSION_MEMBER_CONFLICT_UPDATE_SQL
      )
    ).toBe(true);
  });

  it("rejects legacy demoting conflict clause", () => {
    expect(
      matchJoinConflictPreservesIsInCall(
        "display_name = EXCLUDED.display_name, is_in_call = false"
      )
    ).toBe(false);
  });

  it("migration ON CONFLICT does not set is_in_call=false", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260813120000_match_join_preserve_is_in_call.sql"
      ),
      "utf8"
    );
    const conflict =
      sql.split("ON CONFLICT (session_id, device_id) DO UPDATE")[1] ?? "";
    const setBlock = conflict.split("RETURN QUERY")[0] ?? "";
    expect(setBlock).not.toMatch(/is_in_call\s*=\s*false/i);
    expect(setBlock).toContain("display_name = EXCLUDED.display_name");
    expect(sql).toMatch(/VALUES\s*\([\s\S]*?false\s*\)/);
  });
});
