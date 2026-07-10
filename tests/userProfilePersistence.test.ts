import { describe, expect, it } from "vitest";
import {
  resolveProfileConfirmFilter,
  resolveProfileWriteMode,
} from "@/lib/userProfilePersistence";

describe("userProfilePersistence", () => {
  it("updates by user_id when profile exists on another device", () => {
    const mode = resolveProfileWriteMode({
      deviceId: "11111111-1111-4111-8111-111111111111",
      linkedUserId: "22222222-2222-4222-8222-222222222222",
      existingProfile: {
        device_id: "33333333-3333-4333-8333-333333333333",
        user_id: "22222222-2222-4222-8222-222222222222",
      },
    });

    expect(mode).toEqual({
      type: "user_update",
      userId: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("upserts by device_id when profile is on the same device", () => {
    const deviceId = "11111111-1111-4111-8111-111111111111";
    const mode = resolveProfileWriteMode({
      deviceId,
      linkedUserId: "22222222-2222-4222-8222-222222222222",
      existingProfile: {
        device_id: deviceId,
        user_id: "22222222-2222-4222-8222-222222222222",
      },
    });

    expect(mode).toEqual({ type: "device_upsert", deviceId });
  });

  it("confirms saved profile by user_id after cross-device update", () => {
    const writeMode = {
      type: "user_update" as const,
      userId: "22222222-2222-4222-8222-222222222222",
    };

    expect(
      resolveProfileConfirmFilter({
        deviceId: "11111111-1111-4111-8111-111111111111",
        linkedUserId: writeMode.userId,
        writeMode,
      })
    ).toEqual({
      column: "user_id",
      value: "22222222-2222-4222-8222-222222222222",
    });
  });
});
