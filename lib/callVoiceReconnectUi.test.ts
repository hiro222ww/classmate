import { describe, expect, it } from "vitest";
import { resolveVoiceSelfReconnecting } from "./callVoiceReconnectUi";

describe("resolveVoiceSelfReconnecting", () => {
  it("is false for healthy solo (no remotes)", () => {
    expect(
      resolveVoiceSelfReconnecting({
        voiceLayerActive: true,
        voiceJoinFatalError: false,
        callActiveRemoteIds: [],
        peerStates: { ghost: "connecting" },
        peerDiagnostics: {
          ghost: { autoHardResetInProgress: true },
        },
      })
    ).toBe(false);
  });

  it("is true when a call-active remote is connecting with none connected", () => {
    expect(
      resolveVoiceSelfReconnecting({
        voiceLayerActive: true,
        voiceJoinFatalError: false,
        callActiveRemoteIds: ["peer-a"],
        peerStates: { "peer-a": "connecting" },
        peerDiagnostics: {},
      })
    ).toBe(true);
  });

  it("is false when at least one call-active remote is connected", () => {
    expect(
      resolveVoiceSelfReconnecting({
        voiceLayerActive: true,
        voiceJoinFatalError: false,
        callActiveRemoteIds: ["peer-a", "peer-b"],
        peerStates: { "peer-a": "connected", "peer-b": "connecting" },
        peerDiagnostics: {
          "peer-b": { voicePeerRepairInProgress: true },
        },
      })
    ).toBe(false);
  });
});
