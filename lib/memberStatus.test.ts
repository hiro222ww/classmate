import { describe, expect, it } from "vitest";
import {
  getMemberStatusLabel,
  resolveInternalMemberStatus,
  sanitizePresenceForUi,
  toMemberPresenceStatus,
} from "./memberStatus";

describe("sanitizePresenceForUi", () => {
  it("preserves session call flags when presence is stale", () => {
    const stale = new Date(Date.now() - 60_000).toISOString();
    const out = sanitizePresenceForUi(
      {
        is_in_call: true,
        screen: "call",
        last_seen_at: stale,
        effective_status: "calling",
      },
      15_000,
      { preserveSessionCall: true }
    );
    expect(out.is_in_call).toBe(true);
    expect(out.screen).toBe("call");
  });

  it("clears call flags when not preserving", () => {
    const stale = new Date(Date.now() - 60_000).toISOString();
    const out = sanitizePresenceForUi(
      {
        is_in_call: true,
        screen: "call",
        last_seen_at: stale,
      },
      15_000
    );
    expect(out.is_in_call).toBe(false);
    expect(out.screen).toBeNull();
  });
});

describe("resolveInternalMemberStatus room presence", () => {
  it("marks active call session members as in_voice", () => {
    const resolved = resolveInternalMemberStatus({
      context: "room",
      deviceId: "peer-1",
      inSessionMembers: true,
      is_in_call: true,
      screen: "call",
      last_seen_at: new Date(Date.now() - 60_000).toISOString(),
      currentSessionId: "sess-a",
    });
    expect(resolved.internal).toBe("in_voice");
    expect(resolved.reason).toBe("active_call_member");
    expect(toMemberPresenceStatus(resolved.internal)).toBe("in_call");
    expect(getMemberStatusLabel(resolved.internal, "room")).toBe("通話中");
  });

  it("marks fresh room presence as online", () => {
    const resolved = resolveInternalMemberStatus({
      context: "room",
      deviceId: "peer-1",
      inSessionMembers: true,
      is_in_call: false,
      screen: "room",
      last_seen_at: new Date().toISOString(),
      currentSessionId: "sess-a",
    });
    expect(resolved.internal).toBe("in_room");
    expect(toMemberPresenceStatus(resolved.internal)).toBe("online");
    expect(getMemberStatusLabel(resolved.internal, "room")).toBe("オンライン");
  });

  it("does not keep in_call when fresh presence says room", () => {
    const resolved = resolveInternalMemberStatus({
      context: "room",
      deviceId: "peer-1",
      inSessionMembers: true,
      is_in_call: true,
      screen: "room",
      last_seen_at: new Date().toISOString(),
      currentSessionId: "sess-a",
    });
    expect(resolved.internal).toBe("in_room");
    expect(getMemberStatusLabel(resolved.internal, "room")).toBe("オンライン");
  });

  it("shows offline only when not in session and not present", () => {
    const resolved = resolveInternalMemberStatus({
      context: "room",
      deviceId: "peer-1",
      inSessionMembers: false,
      inClassMembership: false,
      is_in_call: false,
      screen: null,
      last_seen_at: null,
    });
    expect(resolved.internal).toBe("offline");
    expect(toMemberPresenceStatus(resolved.internal)).toBe("offline");
  });

  it("ignores call presence from another session", () => {
    const resolved = resolveInternalMemberStatus({
      context: "room",
      deviceId: "peer-1",
      inSessionMembers: true,
      is_in_call: false,
      screen: "call",
      last_seen_at: new Date().toISOString(),
      presenceSessionId: "sess-old",
      currentSessionId: "sess-new",
    });
    expect(resolved.internal).toBe("in_session");
    expect(getMemberStatusLabel(resolved.internal, "room")).toBe("オンライン");
  });
});
