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
import { CALL_JOIN_TRANSITION_GRACE_MS } from "./callPresenceGrace";

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
      joinTransitionSinceMs: nowMs - 2_000,
      screen: "room",
    });
    expect(grace.priority).toBe("presence_stale_grace");
    expect(grace.peerStillInCall).toBe(true);
    expect(grace.reason).toBe("join_transition");

    const expired = evaluateCallParticipationPriority({
      nowMs,
      explicitLeft: false,
      inApiSessionMembers: true,
      absentSinceMs: null,
      isInCall: false,
      lastInCallAtMs: nowMs - CALL_JOIN_TRANSITION_GRACE_MS - 1,
      joinTransitionSinceMs: nowMs - CALL_JOIN_TRANSITION_GRACE_MS - 1,
      screen: "room",
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
    const label = resolveParticipationPriorityStatus("explicit_left");
    expect(label?.text).toBe("退出済み");
  });

  it("maps grace participation to preparing labels", () => {
    expect(resolveParticipationPriorityStatus("absent_grace")?.text).toBe(
      "接続確認中"
    );
    expect(resolveParticipationPriorityStatus("presence_stale_grace")?.text).toBe(
      "参加準備中"
    );
    expect(
      resolveParticipationPriorityStatus("presence_stale_grace", {
        screen: "room",
      })?.text
    ).toBe("待機中");
    expect(mapParticipationToStatusChoice("absent_grace")).toBe("connecting");
    expect(mapParticipationToStatusChoice("presence_stale_grace")).toBe(
      "connecting"
    );
  });

  it("maps expired participation to 不在 label", () => {
    expect(resolveParticipationPriorityStatus("absent_expired")?.text).toBe(
      "不在"
    );
    expect(resolveParticipationPriorityStatus("presence_stale_expired")?.text).toBe(
      "不在"
    );
  });
});
