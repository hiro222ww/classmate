import { describe, expect, it } from "vitest";
import {
  classifyTransportDisconnect,
  evaluateIceDisconnectedReconnectSuppressReason,
  isPeerPcDisconnectedOnly,
} from "./voiceIceDisconnectedGuard";

describe("voiceIceDisconnectedGuard", () => {
  it("classifies ice reconnect reasons before pc disconnect state", () => {
    expect(
      classifyTransportDisconnect({
        reconnectReason: "ice_disconnected",
        conn: "disconnected",
        ice: "disconnected",
      })
    ).toBe("ice");
  });

  it("classifies pc reconnect reasons", () => {
    expect(
      classifyTransportDisconnect({
        reconnectReason: "pc_disconnected",
        conn: "disconnected",
        ice: "connected",
      })
    ).toBe("pc");
  });

  it("suppresses reconnect when playback evidence exists", () => {
    expect(
      evaluateIceDisconnectedReconnectSuppressReason({
        hasPlaybackEvidence: true,
        audioConfirmedStrict: false,
        trackLive: false,
        inboundDeltaBytes: 0,
        outboundDeltaBytes: 0,
        conn: "disconnected",
        ice: "connected",
      })
    ).toBe("playback_evidence");
  });

  it("detects pc disconnected only from connection state", () => {
    expect(isPeerPcDisconnectedOnly({ conn: "disconnected" })).toBe(true);
    expect(isPeerPcDisconnectedOnly({ conn: "failed" })).toBe(false);
  });
});
