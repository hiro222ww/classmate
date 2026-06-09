import { describe, expect, it } from "vitest";
import {
  isActiveOfferOwner,
  resolveOfferConnectionConflict,
} from "./voiceOfferGlareGuard";

describe("voiceOfferGlareGuard", () => {
  it("passive rolls back when local fallback offer collides with active offer", () => {
    expect(
      resolveOfferConnectionConflict({
        localDeviceId: "device-b",
        remoteDeviceId: "device-a",
        localConnectionId: "conn-local",
        incomingConnectionId: "conn-remote",
        sig: "have-local-offer",
        localOfferInFlight: true,
      })
    ).toEqual({ action: "rollback_accept_remote_offer" });
  });

  it("active ignores competing inbound offer while local offer is in flight", () => {
    expect(
      resolveOfferConnectionConflict({
        localDeviceId: "device-a",
        remoteDeviceId: "device-b",
        localConnectionId: "conn-local",
        incomingConnectionId: "conn-remote",
        sig: "have-local-offer",
        localOfferInFlight: true,
      })
    ).toEqual({
      action: "ignore_remote_offer",
      reason: "local_offer_in_flight",
    });
  });

  it("accepts incoming connection id when no local offer is in flight", () => {
    expect(
      resolveOfferConnectionConflict({
        localDeviceId: "device-b",
        remoteDeviceId: "device-a",
        localConnectionId: "conn-local",
        incomingConnectionId: "conn-remote",
        sig: "stable",
        localOfferInFlight: false,
      })
    ).toEqual({ action: "accept_incoming_connection_id" });
  });

  it("treats lower device id as active offer owner", () => {
    expect(isActiveOfferOwner("aaa", "bbb")).toBe(true);
    expect(isActiveOfferOwner("bbb", "aaa")).toBe(false);
  });
});
