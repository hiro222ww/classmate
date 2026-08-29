import { describe, expect, it } from "vitest";
import {
  CLASS_VOTE_THRESHOLD,
  buildClassVoteStatusView,
  hasEnoughClassVotes,
  normalizeClassVoteDeviceId,
  normalizeOptionalClassId,
  normalizeSessionId,
  parsePromoteRpcResult,
  shouldShowClassVoteUi,
} from "./sessionClassVote";

describe("sessionClassVote helpers", () => {
  it("normalizes uuid session and class ids", () => {
    const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    expect(normalizeSessionId(id)).toBe(id);
    expect(normalizeSessionId("bad")).toBe("");
    expect(normalizeOptionalClassId(id)).toBe(id);
    expect(normalizeOptionalClassId("")).toBe("");
  });

  it("accepts join-allowed device ids", () => {
    expect(
      normalizeClassVoteDeviceId("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")
    ).toBe("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(normalizeClassVoteDeviceId("test-device-1")).toBe("test-device-1");
    expect(normalizeClassVoteDeviceId("")).toBe("");
  });

  it("requires threshold votes to promote", () => {
    expect(hasEnoughClassVotes(2)).toBe(false);
    expect(hasEnoughClassVotes(CLASS_VOTE_THRESHOLD)).toBe(true);
  });

  it("parses promote rpc jsonb", () => {
    expect(
      parsePromoteRpcResult({
        ok: true,
        reason: "promoted",
        promoted: true,
        vote_count: 3,
        class_id: "c1",
        class_name: "クラス0001A",
      })
    ).toEqual({
      ok: true,
      reason: "promoted",
      promoted: true,
      vote_count: 3,
      class_id: "c1",
      class_name: "クラス0001A",
      lifecycle: undefined,
    });

    expect(parsePromoteRpcResult(null).ok).toBe(false);
  });

  it("shows vote UI only when locked provisional with 3+ members", () => {
    expect(
      shouldShowClassVoteUi({
        memberCount: 3,
        membersLocked: true,
        lifecycle: "provisional",
        promoted: false,
      })
    ).toBe(true);

    expect(
      shouldShowClassVoteUi({
        memberCount: 3,
        membersLocked: false,
        lifecycle: "provisional",
        promoted: false,
      })
    ).toBe(false);

    expect(
      shouldShowClassVoteUi({
        memberCount: 2,
        membersLocked: true,
        lifecycle: "provisional",
        promoted: false,
      })
    ).toBe(false);

    expect(
      shouldShowClassVoteUi({
        memberCount: 1,
        membersLocked: false,
        lifecycle: "official",
        promoted: true,
      })
    ).toBe(true);
  });

  it("builds status view with canShowVoteUi", () => {
    const view = buildClassVoteStatusView({
      voteCount: 1,
      selfVoted: true,
      promoted: false,
      classId: "c1",
      className: "クラス0001A",
      lifecycle: "provisional",
      membersLocked: true,
      memberCount: 4,
    });
    expect(view.selfVoted).toBe(true);
    expect(view.canShowVoteUi).toBe(true);
    expect(view.voteCount).toBe(1);
  });
});
