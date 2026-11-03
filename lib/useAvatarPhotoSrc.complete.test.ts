import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("useAvatarPhotoSrc iOS cached-image contract", () => {
  it("exposes imgRef and complete/naturalWidth handling", () => {
    const source = readFileSync(
      join(process.cwd(), "hooks/useAvatarPhotoSrc.ts"),
      "utf8"
    );
    expect(source).toContain("imgRef");
    expect(source).toContain("naturalWidth");
    expect(source).toContain("complete");
    expect(source).toContain("iOS Safari");
  });

  it("wires imgRef into CmAvatar and MemberListAvatar", () => {
    const cm = readFileSync(
      join(process.cwd(), "components/ui/CmAvatar.tsx"),
      "utf8"
    );
    const list = readFileSync(
      join(process.cwd(), "components/MemberListAvatar.tsx"),
      "utf8"
    );
    expect(cm).toContain("imgRef");
    expect(cm).toContain("ref={imgRef}");
    expect(list).toContain("imgRef");
    expect(list).toContain("ref={imgRef}");
  });
});

describe("room/home self photo alignment with call", () => {
  it("RoomClient uses useSelfProfilePhoto for account/strip SoT", () => {
    const source = readFileSync(
      join(process.cwd(), "app/room/RoomClient.tsx"),
      "utf8"
    );
    expect(source).toContain("useSelfProfilePhoto");
    expect(source).toContain("accountPhotoPath");
    expect(source).toContain("selfProfilePhotoPath");
  });

  it("HomeClient uses useSelfProfilePhoto and status photo merge", () => {
    const home = readFileSync(
      join(process.cwd(), "app/HomeClient.tsx"),
      "utf8"
    );
    expect(home).toContain("useSelfProfilePhoto");
    expect(home).toContain("mergeHomeMemberWithSessionStatus");
    expect(home).toContain("accountPhotoPath");
  });
});
