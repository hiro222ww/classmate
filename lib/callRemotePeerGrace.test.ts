import { describe, expect, it } from "vitest";
import {
  createRemotePeerGraceRefs,
  getRemoteIdsWithMemberGrace,
  isPresenceConfirmedRemoteLeave,
  markSessionMemberRemoteIds,
} from "./callRemotePeerGrace";

describe("callRemotePeerGrace reconnect targeting", () => {
  it("does not add every session member into remoteIds", () => {
    const refs = createRemotePeerGraceRefs();
    const nowMs = Date.now();
    markSessionMemberRemoteIds(refs, ["peer-left", "peer-active"], nowMs);
    refs.lastStrictInCallAt.set("peer-active", nowMs);

    const { ids, graceIds } = getRemoteIdsWithMemberGrace(
      ["peer-active"],
      refs,
      nowMs,
      ["peer-left", "peer-active"]
    );

    expect(ids).toContain("peer-active");
    expect(ids).not.toContain("peer-left");
    expect(graceIds).not.toContain("peer-left");
  });

  it("detects presence-confirmed leave from room/home", () => {
    expect(
      isPresenceConfirmedRemoteLeave({
        is_in_call: false,
        screen: "room",
        last_seen_at: new Date().toISOString(),
      })
    ).toBe(true);
    expect(
      isPresenceConfirmedRemoteLeave({
        is_in_call: false,
        screen: "home",
        last_seen_at: new Date().toISOString(),
      })
    ).toBe(true);
    expect(
      isPresenceConfirmedRemoteLeave({
        is_in_call: true,
        screen: "call",
        last_seen_at: new Date().toISOString(),
      })
    ).toBe(false);
  });
});
