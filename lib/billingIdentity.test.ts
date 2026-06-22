import { describe, expect, it } from "vitest";
import { resolveStripeCustomerIdentityFromSources } from "@/lib/resolveStripeCustomerIdentity";

describe("resolveStripeCustomerIdentityFromSources", () => {
  const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const deviceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  it("prefers metadata when both ids are present", () => {
    expect(
      resolveStripeCustomerIdentityFromSources({
        metadataUserId: userId,
        metadataDeviceId: deviceId,
        mapping: {
          user_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          device_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        },
      })
    ).toEqual({ userId, deviceId });
  });

  it("restores user_id from stripe_customer_id mapping when metadata is empty", () => {
    expect(
      resolveStripeCustomerIdentityFromSources({
        metadataUserId: null,
        metadataDeviceId: null,
        mapping: {
          user_id: userId,
          device_id: deviceId,
        },
      })
    ).toEqual({ userId, deviceId });
  });

  it("fills missing device_id from mapping while keeping metadata user_id", () => {
    expect(
      resolveStripeCustomerIdentityFromSources({
        metadataUserId: userId,
        metadataDeviceId: null,
        mapping: {
          user_id: userId,
          device_id: deviceId,
        },
      })
    ).toEqual({ userId, deviceId });
  });

  it("fills missing user_id from mapping while keeping metadata device_id", () => {
    expect(
      resolveStripeCustomerIdentityFromSources({
        metadataUserId: null,
        metadataDeviceId: deviceId,
        mapping: {
          user_id: userId,
          device_id: deviceId,
        },
      })
    ).toEqual({ userId, deviceId });
  });
});
