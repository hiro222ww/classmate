import { describe, expect, it } from "vitest";
import {
  applyIncomingMembersWithProfileRetention,
  mergeMemberProfileFields,
} from "./memberProfileMerge";

type Row = {
  device_id: string;
  display_name: string;
  photo_path: string | null;
  is_in_call?: boolean;
};

describe("mergeMemberProfileFields", () => {
  it("keeps known photo when incoming photo is null", () => {
    const merged = mergeMemberProfileFields<Row>(
      {
        device_id: "d1",
        display_name: "ひろ",
        photo_path: "user/hiro.jpg",
      },
      {
        device_id: "d1",
        display_name: "ひろ",
        photo_path: null,
        is_in_call: true,
      }
    );
    expect(merged.photo_path).toBe("user/hiro.jpg");
    expect(merged.display_name).toBe("ひろ");
    expect(merged.is_in_call).toBe(true);
  });

  it("does not let 参加者 wipe a usable name", () => {
    const merged = mergeMemberProfileFields(
      { device_id: "d1", display_name: "ひろ", photo_path: "a.jpg" },
      { device_id: "d1", display_name: "参加者", photo_path: "a.jpg" }
    );
    expect(merged.display_name).toBe("ひろ");
  });

  it("accepts a better incoming name and photo", () => {
    const merged = mergeMemberProfileFields(
      { device_id: "d1", display_name: "参加者", photo_path: null },
      { device_id: "d1", display_name: "ひろ", photo_path: "user/hiro.jpg" }
    );
    expect(merged.display_name).toBe("ひろ");
    expect(merged.photo_path).toBe("user/hiro.jpg");
  });
});

describe("applyIncomingMembersWithProfileRetention", () => {
  it("retains previous photo/name across a sparse refetch", () => {
    const prev: Row[] = [
      {
        device_id: "d1",
        display_name: "ひろ",
        photo_path: "user/hiro.jpg",
        is_in_call: true,
      },
      {
        device_id: "d2",
        display_name: "友",
        photo_path: "user/tomo.jpg",
        is_in_call: true,
      },
    ];
    const incoming: Row[] = [
      {
        device_id: "d1",
        display_name: "参加者",
        photo_path: null,
        is_in_call: true,
      },
      {
        device_id: "d2",
        display_name: "友",
        photo_path: null,
        is_in_call: false,
      },
    ];
    const next = applyIncomingMembersWithProfileRetention(prev, incoming);
    expect(next[0]?.display_name).toBe("ひろ");
    expect(next[0]?.photo_path).toBe("user/hiro.jpg");
    expect(next[1]?.photo_path).toBe("user/tomo.jpg");
    expect(next[1]?.is_in_call).toBe(false);
  });
});

describe("mergeSeededCallMembers semantics", () => {
  it("lets snapshot profile beat placeholder prev via mergeMemberProfileFields", () => {
    const placeholder = {
      device_id: "d1",
      display_name: "参加者",
      photo_path: null as string | null,
      is_in_call: true,
      screen: "call",
    };
    const seeded = {
      device_id: "d1",
      display_name: "ひろ",
      photo_path: "user/hiro.jpg",
      is_in_call: true,
      screen: "call",
    };
    // Same order CallClient uses after the fix: prev placeholder, then seeded.
    const merged = mergeMemberProfileFields(placeholder, seeded);
    expect(merged.display_name).toBe("ひろ");
    expect(merged.photo_path).toBe("user/hiro.jpg");
  });
});
