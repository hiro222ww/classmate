import { describe, expect, it } from "vitest";
import { isInviteJoinFailureMessage } from "./inviteDiagnostics";

describe("isInviteJoinFailureMessage", () => {
  it("matches invite join failure copy", () => {
    expect(isInviteJoinFailureMessage("招待されたクラスへの参加に失敗しました")).toBe(
      true
    );
    expect(isInviteJoinFailureMessage("参加に失敗しました")).toBe(true);
    expect(isInviteJoinFailureMessage("参加できるクラス数の上限に達しています")).toBe(
      true
    );
  });

  it("does not match unrelated room errors", () => {
    expect(isInviteJoinFailureMessage("sessionId required")).toBe(false);
    expect(isInviteJoinFailureMessage("接続が不安定です。再接続しています…")).toBe(
      false
    );
  });
});
