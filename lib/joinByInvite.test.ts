import { describe, expect, it } from "vitest";
import {
  buildInviteRoomRedirect,
  joinByInviteUserMessage,
  mapLegacyInviteError,
} from "@/lib/joinByInviteTypes";
import { formatInviteJoinApiError } from "@/lib/inviteDiagnostics";

describe("joinByInviteTypes", () => {
  it("maps legacy invite errors to unified codes", () => {
    expect(mapLegacyInviteError("invite_expired")).toBe("expired_invite");
    expect(mapLegacyInviteError("class_slots_limit")).toBe("class_full");
    expect(mapLegacyInviteError("guardian_consent_required")).toBe(
      "age_restricted"
    );
    expect(mapLegacyInviteError("class_not_found")).toBe("invalid_invite");
  });

  it("builds room redirect without invite flag after join", () => {
    expect(
      buildInviteRoomRedirect({
        classId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        sessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      })
    ).toBe(
      "/room?classId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa&sessionId=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb&autojoin=1"
    );
  });

  it("returns user-facing messages per code", () => {
    expect(joinByInviteUserMessage("already_member")).toContain("すでに");
    expect(joinByInviteUserMessage("needs_profile")).toContain("プロフィール");
    expect(joinByInviteUserMessage("restore_login")).toContain("ログイン");
  });
});

describe("formatInviteJoinApiError", () => {
  it("prefers API message when provided", () => {
    expect(
      formatInviteJoinApiError("class_full", "カスタムメッセージ")
    ).toBe("カスタムメッセージ");
  });

  it("maps unified failure codes", () => {
    expect(formatInviteJoinApiError("expired_invite")).toContain("期限切れ");
    expect(formatInviteJoinApiError("needs_profile")).toContain("プロフィール");
    expect(formatInviteJoinApiError("age_restricted")).toContain("年齢");
  });
});

describe("invite join idempotency expectations", () => {
  it("treats already_member as success path", () => {
    expect(joinByInviteUserMessage("already_member")).not.toContain("失敗");
    expect(formatInviteJoinApiError("already_member")).toBe("");
  });
});
