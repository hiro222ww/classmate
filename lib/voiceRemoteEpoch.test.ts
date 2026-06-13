import { describe, expect, it } from "vitest";
import {
  createEmptyRemoteVoiceEpochTrack,
  detectRemoteVoiceEpochChanges,
  type RemoteVoiceEpochTrack,
} from "./voiceRemoteEpoch";

describe("detectRemoteVoiceEpochChanges", () => {
  it("does not emit a change on first in-call sighting", () => {
    const tracks = new Map<string, RemoteVoiceEpochTrack>();
    const changes = detectRemoteVoiceEpochChanges(
      [{ device_id: "remote-a", is_in_call: true, screen: "call" }],
      "viewer",
      tracks
    );
    expect(changes).toEqual([]);
    expect(tracks.get("remote-a")?.epoch).toBe(1);
  });

  it("detects reentered_call when remote leaves and returns", () => {
    const tracks = new Map<string, RemoteVoiceEpochTrack>([
      [
        "remote-a",
        {
          ...createEmptyRemoteVoiceEpochTrack(),
          epoch: 1,
          lastInCall: true,
          initialized: true,
          lastScreen: "call",
        },
      ],
    ]);

    tracks.set("remote-a", {
      ...tracks.get("remote-a")!,
      lastInCall: false,
    });

    const changes = detectRemoteVoiceEpochChanges(
      [{ device_id: "remote-a", is_in_call: true, screen: "call" }],
      "viewer",
      tracks
    );

    expect(changes).toEqual([
      {
        remoteId: "remote-a",
        oldEpoch: 1,
        newEpoch: 2,
        reason: "reentered_call",
      },
    ]);
  });

  it("detects joined_at_changed while still in call", () => {
    const tracks = new Map<string, RemoteVoiceEpochTrack>([
      [
        "remote-a",
        {
          ...createEmptyRemoteVoiceEpochTrack(),
          epoch: 1,
          lastInCall: true,
          initialized: true,
          joinedAt: "2026-01-01T00:00:00.000Z",
          lastScreen: "call",
        },
      ],
    ]);

    const changes = detectRemoteVoiceEpochChanges(
      [
        {
          device_id: "remote-a",
          is_in_call: true,
          screen: "call",
          joined_at: "2026-06-13T00:00:00.000Z",
        },
      ],
      "viewer",
      tracks
    );

    expect(changes).toEqual([
      {
        remoteId: "remote-a",
        oldEpoch: 1,
        newEpoch: 2,
        reason: "joined_at_changed",
      },
    ]);
  });
});
