import { describe, expect, it } from "vitest";
import { shouldEmitProductionLogLine } from "./debugLog";
import {
  describeVoiceBootstrapSkipReason,
  formatVoiceBootstrapMemberSummary,
} from "./voiceBootstrapLog";

describe("voiceBootstrapLog", () => {
  it("emits [voice-bootstrap] lines in production filter", () => {
    expect(
      shouldEmitProductionLogLine(
        "[voice-bootstrap] offer-effect remoteIds=0 signalReady=1"
      )
    ).toBe(true);
  });

  it("describes exclusion reasons for bootstrap targets", () => {
    expect(
      describeVoiceBootstrapSkipReason({
        deviceId: "remote-a",
        selfDeviceId: "self",
        isInCall: true,
        screen: "call",
        inRemoteIds: true,
        localExited: false,
        explicitRemoved: false,
      })
    ).toBe("in_remoteIds");

    expect(
      describeVoiceBootstrapSkipReason({
        deviceId: "remote-a",
        selfDeviceId: "self",
        isInCall: false,
        screen: "room",
        inRemoteIds: false,
        localExited: false,
        explicitRemoved: false,
      })
    ).toBe("left_call_screen:room");

    expect(
      describeVoiceBootstrapSkipReason({
        deviceId: "remote-a",
        selfDeviceId: "self",
        isInCall: true,
        screen: "call",
        inRemoteIds: false,
        localExited: true,
        explicitRemoved: false,
      })
    ).toBe("local_exited");
  });

  it("formats member summary for offer-effect logs", () => {
    const summary = formatVoiceBootstrapMemberSummary(
      [
        { device_id: "aaaa-self", is_in_call: true, screen: "call" },
        { device_id: "bbbb-remote", is_in_call: false, screen: "room" },
      ],
      {
        selfDeviceId: "aaaa-self",
        remoteIds: [],
        localExitedIds: new Set(),
        explicitRemovedIds: new Set(),
      }
    );
    expect(summary).toContain("self:inCall=1:screen=call:skip=self");
    expect(summary).toContain("mote:inCall=0:screen=room:skip=left_call_screen:room");
  });
});
