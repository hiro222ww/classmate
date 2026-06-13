import { describe, expect, it } from "vitest";
import {
  allowsPassiveFallbackOffer,
  shouldBlockSoftResetForJoinPhase,
  shouldSendPassiveOfferAfterWaitScheduleFailed,
} from "./voiceRemoteJoinPhase";

describe("allowsPassiveFallbackOffer", () => {
  it("allows only initial_connect by default", () => {
    expect(allowsPassiveFallbackOffer("initial_connect")).toBe(true);
    expect(allowsPassiveFallbackOffer("awaiting_active_offer")).toBe(false);
    expect(allowsPassiveFallbackOffer("established")).toBe(false);
    expect(allowsPassiveFallbackOffer(undefined, { initialJoin: true })).toBe(
      true
    );
    expect(
      allowsPassiveFallbackOffer("awaiting_active_offer", { initialJoin: true })
    ).toBe(false);
  });
});

describe("shouldBlockSoftResetForJoinPhase", () => {
  it("blocks soft reset while awaiting active offer", () => {
    expect(shouldBlockSoftResetForJoinPhase("awaiting_active_offer")).toBe(
      true
    );
    expect(shouldBlockSoftResetForJoinPhase("initial_connect")).toBe(false);
  });
});

describe("shouldSendPassiveOfferAfterWaitScheduleFailed", () => {
  it("never sends passive offer after auto_hard_reset", () => {
    expect(
      shouldSendPassiveOfferAfterWaitScheduleFailed({
        reconnectReason: "auto_hard_reset",
        joinPhase: "initial_connect",
      })
    ).toBe(false);
    expect(
      shouldSendPassiveOfferAfterWaitScheduleFailed({
        reconnectReason: "auto_hard_reset",
        joinPhase: "awaiting_active_offer",
      })
    ).toBe(false);
  });

  it("allows passive offer only during initial_connect for other reasons", () => {
    expect(
      shouldSendPassiveOfferAfterWaitScheduleFailed({
        reconnectReason: "passive_on_join",
        joinPhase: "initial_connect",
      })
    ).toBe(true);
    expect(
      shouldSendPassiveOfferAfterWaitScheduleFailed({
        reconnectReason: "passive_on_join",
        joinPhase: "awaiting_active_offer",
      })
    ).toBe(false);
  });
});
