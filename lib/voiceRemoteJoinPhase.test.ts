import { describe, expect, it } from "vitest";
import {
  allowsPassiveFallbackOffer,
  shouldBlockSoftResetForJoinPhase,
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
