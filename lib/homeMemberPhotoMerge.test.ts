import { describe, expect, it } from "vitest";
import { mergeHomeMemberWithSessionStatus } from "./homeMemberPhotoMerge";

describe("mergeHomeMemberWithSessionStatus", () => {
  it("keeps status photo_path when class/members photo is null", () => {
    const merged = mergeHomeMemberWithSessionStatus(
      {
        device_id: "d1",
        display_name: "ひろ",
        photo_path: null,
        avatar_url: null,
      },
      {
        device_id: "d1",
        display_name: "ひろ",
        photo_path: "user/hiro.jpg",
        avatar_url:
          "https://example.supabase.co/storage/v1/object/public/profile-photos/user/hiro.jpg",
        is_in_call: true,
        screen: "call",
        last_seen_at: "2026-11-03T00:00:00.000Z",
      }
    );
    expect(merged.photo_path).toBe("user/hiro.jpg");
    expect(merged.avatar_url).toContain("profile-photos/user/hiro.jpg");
    expect(merged.is_in_call).toBe(true);
    expect(merged.screen).toBe("call");
  });

  it("keeps class/members photo when status omits photo", () => {
    const merged = mergeHomeMemberWithSessionStatus(
      {
        device_id: "d1",
        display_name: "ひろ",
        photo_path: "user/hiro.jpg",
      },
      {
        device_id: "d1",
        display_name: "参加者",
        photo_path: null,
        is_in_call: false,
        screen: "room",
      }
    );
    expect(merged.photo_path).toBe("user/hiro.jpg");
    expect(merged.display_name).toBe("ひろ");
    expect(merged.is_in_call).toBe(false);
  });
});
