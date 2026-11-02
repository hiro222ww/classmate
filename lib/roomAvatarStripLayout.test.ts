import { describe, expect, it } from "vitest";
import {
  resolveMaxVisibleAvatars,
  resolveRoomAvatarStripLayout,
} from "./roomAvatarStripLayout";

describe("resolveRoomAvatarStripLayout", () => {
  it("uses large avatars for 1–2 members and never invents empty seats", () => {
    expect(resolveRoomAvatarStripLayout({ memberCount: 1 })).toMatchObject({
      density: "lg",
      avatarPx: 68,
      visibleCount: 1,
      overflowCount: 0,
      showOverflow: false,
    });
    expect(resolveRoomAvatarStripLayout({ memberCount: 2 })).toMatchObject({
      density: "lg",
      visibleCount: 2,
      showOverflow: false,
    });
  });

  it("steps down to medium for 3–4 and small for 5", () => {
    expect(resolveRoomAvatarStripLayout({ memberCount: 3 }).density).toBe("md");
    expect(resolveRoomAvatarStripLayout({ memberCount: 4 }).density).toBe("md");
    expect(resolveRoomAvatarStripLayout({ memberCount: 5 })).toMatchObject({
      density: "sm",
      avatarPx: 48,
      visibleCount: 5,
      showOverflow: false,
    });
  });

  it("does not hardcode capacity 5 — 6 can still show without overflow when cap allows", () => {
    expect(
      resolveRoomAvatarStripLayout({ memberCount: 6, maxVisible: 6 })
    ).toMatchObject({
      density: "sm",
      visibleCount: 6,
      overflowCount: 0,
      showOverflow: false,
    });
  });

  it("collapses to +N once past the soft visible cap (future 7+)", () => {
    const layout = resolveRoomAvatarStripLayout({
      memberCount: 8,
      maxVisible: 6,
    });
    expect(layout.showOverflow).toBe(true);
    expect(layout.visibleCount).toBe(5);
    expect(layout.overflowCount).toBe(3);
    expect(layout.density).toBe("sm");
  });

  it("scales maxVisible with content width", () => {
    expect(resolveMaxVisibleAvatars(320)).toBe(5);
    expect(resolveMaxVisibleAvatars(500)).toBe(6);
    expect(resolveMaxVisibleAvatars(900)).toBe(7);
  });
});
