import { describe, expect, it } from "vitest";
import {
  isActiveOfferOwner,
  makeStableConnectionId,
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

  it("active ignores competing inbound offer when both sides sent offers", () => {
    expect(
      resolveOfferConnectionConflict({
        localDeviceId: "device-a",
        remoteDeviceId: "device-b",
        localConnectionId: "conn-local",
        incomingConnectionId: "conn-remote",
        sig: "have-local-offer",
        localOfferInFlight: true,
        localAnswerReceived: false,
      })
    ).toEqual({
      action: "ignore_remote_offer",
      reason: "active_offer_owner_wins",
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

  it("derives the same stable connection id on both peers", () => {
    expect(makeStableConnectionId("device-a", "device-b")).toBe(
      makeStableConnectionId("device-b", "device-a")
    );
    expect(makeStableConnectionId("device-a", "device-b")).toBe(
      "join__device-a__device-b"
    );
  });
});
