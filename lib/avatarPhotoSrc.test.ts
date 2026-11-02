import { describe, expect, it } from "vitest";
import { resolveAvatarPhotoSrc } from "@/lib/avatarUrl";

/**
 * Behavioral contract for avatar src resolution used by useAvatarPhotoSrc.
 */
describe("avatar photo src contract", () => {
  it("never prefers a broken avatarUrl over a valid photoPath", () => {
    const src = resolveAvatarPhotoSrc({
      photoPath: "device-uuid/profile-123.jpg",
      avatarUrl:
        "https://example.supabase.co/storage/v1/object/public/profile-photos/device-uuid%2Fprofile-123.jpg",
    });

    expect(src).toBeTruthy();
    // Path separators must remain unencoded in the object key.
    expect(src!).toContain(
      "/object/public/profile-photos/device-uuid/profile-123.jpg?"
    );
    expect(src!).not.toContain(
      "/object/public/profile-photos/device-uuid%2Fprofile-123.jpg"
    );
  });

  it("returns null when both inputs are empty so default mark shows", () => {
    expect(
      resolveAvatarPhotoSrc({ photoPath: null, avatarUrl: null })
    ).toBeNull();
    expect(
      resolveAvatarPhotoSrc({ photoPath: "", avatarUrl: "" })
    ).toBeNull();
  });
});
