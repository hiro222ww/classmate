import { describe, expect, it } from "vitest";
import {
  getCallActiveRemoteDeviceIds,
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
});
