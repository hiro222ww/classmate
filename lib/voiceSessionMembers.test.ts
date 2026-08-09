import { describe, expect, it } from "vitest";
import {
  buildVoiceConnectionMembers,
  getCallActiveRemoteDeviceIds,
  getConfirmedCallRemoteDeviceIds,
  isConfirmedLeftCallScreen,
  isMemberActiveOnCallScreen,
} from "./voiceSessionMembers";

describe("voiceSessionMembers call-active", () => {
  it("excludes room/home/offline screens", () => {
    expect(isMemberActiveOnCallScreen({ screen: "call" })).toBe(true);
    expect(isMemberActiveOnCallScreen({ screen: "room" })).toBe(false);
    expect(isMemberActiveOnCallScreen({ screen: "home" })).toBe(false);
  });

  it("returns only in-call members on call screen", () => {
    const ids = getCallActiveRemoteDeviceIds(
      [
        { device_id: "self", is_in_call: true, screen: "call" },
        { device_id: "a", is_in_call: true, screen: "call" },
        { device_id: "b", is_in_call: false, screen: "call" },
        { device_id: "c", is_in_call: true, screen: "room" },
      ],
      "self"
    );
    expect(ids).toEqual(["a"]);
  });

  it("includes lag-tolerant voice members still on call screen", () => {
    // buildVoiceConnectionMembers forces is_in_call while screen=call.
    const voiceMembers = buildVoiceConnectionMembers(
      [
        { device_id: "self", is_in_call: true, screen: "call" },
        { device_id: "peer", is_in_call: false, screen: "call" },
      ],
      { sessionId: "sess", stable: true }
    );
    expect(
      getCallActiveRemoteDeviceIds(voiceMembers, "self", { sessionId: "sess" })
    ).toEqual(["peer"]);
  });

  it("does not force in_call for left-call screens in stable mode", () => {
    const out = buildVoiceConnectionMembers(
      [
        { device_id: "a", is_in_call: false, screen: "room" },
        { device_id: "b", is_in_call: false, screen: "call" },
        { device_id: "c", is_in_call: true, screen: "call" },
      ],
      { sessionId: "sess", stable: true }
    );
    expect(out.find((m) => m.device_id === "a")?.is_in_call).toBe(false);
    expect(out.find((m) => m.device_id === "b")?.is_in_call).toBe(true);
    expect(out.find((m) => m.device_id === "c")?.is_in_call).toBe(true);
  });

  it("treats room/home as confirmed left call and excludes from targets", () => {
    expect(
      isConfirmedLeftCallScreen({ is_in_call: false, screen: "room" })
    ).toBe(true);
    expect(
      getConfirmedCallRemoteDeviceIds(
        [
          { device_id: "self", is_in_call: true, screen: "call" },
          { device_id: "a", is_in_call: true, screen: "call" },
          { device_id: "b", is_in_call: false, screen: "room" },
        ],
        "self"
      )
    ).toEqual(["a"]);
  });
});
