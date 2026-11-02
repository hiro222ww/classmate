import { describe, expect, it, vi } from "vitest";
import { loadProfileMapForMembers } from "./sessionMemberProfiles";

function mockSb(rowsByColumn: {
  device_id?: Array<Record<string, unknown>>;
  user_id?: Array<Record<string, unknown>>;
}) {
  return {
    from: () => ({
      select: () => ({
        in: (column: "device_id" | "user_id", ids: string[]) => {
          const rows = rowsByColumn[column] ?? [];
          const idSet = new Set(ids);
          const key = column === "device_id" ? "device_id" : "user_id";
          return Promise.resolve({
            data: rows.filter((row) => idSet.has(String(row[key] ?? ""))),
            error: null,
          });
        },
      }),
    }),
  } as never;
}

describe("loadProfileMapForMembers photo merge", () => {
  it("prefers user photo_path and fills from device when user photo is empty", async () => {
    const deviceId = "11111111-1111-4111-8111-111111111111";
    const userId = "22222222-2222-4222-8222-222222222222";

    const sb = mockSb({
      device_id: [
        {
          device_id: deviceId,
          user_id: userId,
          display_name: "DeviceName",
          photo_path: "device/photo.jpg",
        },
      ],
      user_id: [
        {
          device_id: "other-device",
          user_id: userId,
          display_name: "UserName",
          photo_path: null,
        },
      ],
    });

    // When device query also indexes user_id from device rows, user map may
    // already be filled — exercise fill path with user-only missing photo via
    // a device row that has photo and a separate user lookup returning empty photo.
    const result = await loadProfileMapForMembers(sb, [
      { deviceId, userId },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const fields = result.profileMap.get(deviceId);
    // Device row is returned first and also seeds byUserId; user photo empty
    // means device photo must remain available.
    expect(fields?.photo_path).toBe("device/photo.jpg");
  });

  it("prefers non-null user photo over device photo", async () => {
    const deviceId = "11111111-1111-4111-8111-111111111111";
    const userId = "22222222-2222-4222-8222-222222222222";

    const sb = mockSb({
      device_id: [
        {
          device_id: deviceId,
          user_id: null,
          display_name: "DeviceName",
          photo_path: "device/old.jpg",
        },
      ],
      user_id: [
        {
          device_id: "other",
          user_id: userId,
          display_name: "UserName",
          photo_path: "user/new.jpg",
        },
      ],
    });

    const result = await loadProfileMapForMembers(sb, [
      { deviceId, userId },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profileMap.get(deviceId)?.photo_path).toBe("user/new.jpg");
    expect(result.profileMap.get(deviceId)?.display_name).toBe("UserName");
  });
});

// silence unused vi in case of future mocks
void vi;
