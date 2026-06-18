import { describe, expect, it } from "vitest";
import {
  CALL_DEPARTED_LABEL_MS,
  CALL_PRESENCE_STALE_GRACE_MS,
  evaluateCallParticipationPriority,
  mapParticipationToStatusChoice,
  resolveParticipationPriorityStatus,
  shouldHideDepartedMemberFromGrid,
  shouldShowVoiceUnstableStatus,
} from "./callStatusPriority";
import { CALL_LIVE_MEMBER_ABSENT_GRACE_MS } from "./callMembersSync";

describe("callStatusPriority", () => {
  const nowMs = 100_000;

  it("treats explicit left as removed", () => {
    const out = evaluateCallParticipationPriority({
      nowMs,
      explicitLeft: true,
      inApiSessionMembers: true,
      absentSinceMs: null,
      isInCall: true,
    });
    expect(out.priority).toBe("explicit_left");
    expect(out.peerStillInCall).toBe(false);
    expect(mapParticipationToStatusChoice(out.priority)).toBe("removed");
  });

  it("grace while missing from session_members then expires", () => {
    const grace = evaluateCallParticipationPriority({
      nowMs,
      explicitLeft: false,
      inApiSessionMembers: false,
      absentSinceMs: nowMs - 2_000,
      isInCall: true,
    });
    expect(grace.priority).toBe("absent_grace");
    expect(grace.peerStillInCall).toBe(false);

    const expired = evaluateCallParticipationPriority({
      nowMs,
      explicitLeft: false,
      inApiSessionMembers: false,
      absentSinceMs: nowMs - CALL_LIVE_MEMBER_ABSENT_GRACE_MS - 1,
      isInCall: true,
    });
    expect(expired.priority).toBe("absent_expired");
    expect(expired.peerStillInCall).toBe(false);
  });

  it("presence stale grace then expired", () => {
    const grace = evaluateCallParticipationPriority({
      nowMs,
      explicitLeft: false,
      inApiSessionMembers: true,
      absentSinceMs: null,
      isInCall: false,
      lastInCallAtMs: nowMs - 2_000,
      screen: "call",
    });
    expect(grace.priority).toBe("presence_stale_grace");

    const expired = evaluateCallParticipationPriority({
      nowMs,
      explicitLeft: false,
      inApiSessionMembers: true,
      absentSinceMs: null,
      isInCall: false,
      lastInCallAtMs: nowMs - CALL_PRESENCE_STALE_GRACE_MS - 1,
      screen: "call",
    });
    expect(expired.priority).toBe("presence_stale_expired");
    expect(expired.peerStillInCall).toBe(false);
  });

  it("does not allow unstable status when peer is not in call", () => {
    expect(
      shouldShowVoiceUnstableStatus({
        peerStillInCall: false,
        participationPriority: "absent_expired",
      })
    ).toBe(false);
    expect(
      shouldShowVoiceUnstableStatus({
        peerStillInCall: true,
        participationPriority: "in_call",
      })
    ).toBe(true);
  });

  it("hides departed member after label window", () => {
    expect(
      shouldHideDepartedMemberFromGrid({
        priority: "absent_expired",
        recentlyDepartedUntilMs: nowMs + CALL_DEPARTED_LABEL_MS,
        nowMs,
      })
    ).toBe(false);
    expect(
      shouldHideDepartedMemberFromGrid({
        priority: "absent_expired",
        recentlyDepartedUntilMs: nowMs - 1,
        nowMs,
      })
    ).toBe(true);
  });

  it("maps removed participation to 退出済み label", () => {
    const label = resolveParticipationPriorityStatus("absent_expired");
    expect(label?.text).toBe("退出済み");
  });

  it("maps grace participation to 不在 label", () => {
    const label = resolveParticipationPriorityStatus("absent_grace");
    expect(label?.text).toBe("不在");
    expect(mapParticipationToStatusChoice("absent_grace")).toBe("offline");
  });
});
