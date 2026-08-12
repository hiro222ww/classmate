import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertClassPresenceGuarded } from "@/lib/presenceRoomUpsert";
import {
  ENSURE_MEMBERSHIP_ROOM_SOURCE,
  ROOM_PRESENCE_HEARTBEAT_SOURCE,
  SESSION_JOIN_REFRESH_ROOM_SOURCE,
} from "@/lib/presenceRoomOverwriteGuard";

type MockSb = {
  inCall: boolean | null;
  upsertCalls: Array<Record<string, unknown>>;
  memberLookupError?: string | null;
  upsertError?: string | null;
  client: SupabaseClient;
};

function createMockSb(opts: {
  inCall?: boolean | null;
  memberLookupError?: string | null;
  upsertError?: string | null;
}): MockSb {
  const state: MockSb = {
    inCall: opts.inCall ?? null,
    upsertCalls: [],
    memberLookupError: opts.memberLookupError ?? null,
    upsertError: opts.upsertError ?? null,
    client: null as unknown as SupabaseClient,
  };

  const client = {
    from(table: string) {
      if (table === "session_members") {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      async maybeSingle() {
                        if (state.memberLookupError) {
                          return {
                            data: null,
                            error: { message: state.memberLookupError },
                          };
                        }
                        if (state.inCall === null) {
                          return { data: null, error: null };
                        }
                        return {
                          data: { is_in_call: state.inCall },
                          error: null,
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "class_presence") {
        return {
          async upsert(payload: Record<string, unknown>) {
            if (state.upsertError) {
              return { error: { message: state.upsertError } };
            }
            state.upsertCalls.push(payload);
            return { error: null };
          },
        };
      }

      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;

  state.client = client;
  return state;
}

describe("upsertClassPresenceGuarded", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("applies first room join when not in call", async () => {
    const mock = createMockSb({ inCall: false });
    const result = await upsertClassPresenceGuarded({
      sb: mock.client,
      classId: "class-1",
      deviceId: "device-1",
      sessionId: "session-1",
      screen: "room",
      status: "waiting",
      source: SESSION_JOIN_REFRESH_ROOM_SOURCE,
      reason: "session_join",
      explicitLeave: false,
    });
    expect(result).toEqual({ ok: true, applied: true });
    expect(mock.upsertCalls).toHaveLength(1);
    expect(mock.upsertCalls[0]?.screen).toBe("room");
  });

  it("applies call screen without looking up in_call guard path demotion", async () => {
    const mock = createMockSb({ inCall: true });
    const result = await upsertClassPresenceGuarded({
      sb: mock.client,
      classId: "class-1",
      deviceId: "device-1",
      sessionId: "session-1",
      screen: "call",
      status: "calling",
      source: "CallClient.presenceHeartbeat",
      reason: "call",
      explicitLeave: false,
    });
    expect(result).toEqual({ ok: true, applied: true });
    expect(mock.upsertCalls[0]?.screen).toBe("call");
  });

  it("ignores delayed RoomClient heartbeat while in_call", async () => {
    const mock = createMockSb({ inCall: true });
    const result = await upsertClassPresenceGuarded({
      sb: mock.client,
      classId: "class-1",
      deviceId: "device-1",
      sessionId: "session-1",
      screen: "room",
      status: "waiting",
      source: ROOM_PRESENCE_HEARTBEAT_SOURCE,
      reason: "heartbeat",
      explicitLeave: false,
    });
    expect(result).toEqual({
      ok: true,
      applied: false,
      ignored: true,
      reason: "session_member_in_call",
    });
    expect(mock.upsertCalls).toHaveLength(0);
  });

  it("ignores delayed session.join room upsert while in_call", async () => {
    const mock = createMockSb({ inCall: true });
    const result = await upsertClassPresenceGuarded({
      sb: mock.client,
      classId: "class-1",
      deviceId: "device-1",
      sessionId: "session-1",
      screen: "room",
      status: "waiting",
      source: SESSION_JOIN_REFRESH_ROOM_SOURCE,
      reason: "session_join",
      explicitLeave: false,
    });
    expect(result).toEqual({
      ok: true,
      applied: false,
      ignored: true,
      reason: "session_member_in_call",
    });
    expect(mock.upsertCalls).toHaveLength(0);
  });

  it("ignores delayed ensure room upsert while in_call", async () => {
    const mock = createMockSb({ inCall: true });
    const result = await upsertClassPresenceGuarded({
      sb: mock.client,
      classId: "class-1",
      deviceId: "device-1",
      sessionId: "session-1",
      screen: "room",
      status: "waiting",
      source: ENSURE_MEMBERSHIP_ROOM_SOURCE,
      reason: "upsert_class_presence",
      explicitLeave: false,
    });
    expect(result).toEqual({
      ok: true,
      applied: false,
      ignored: true,
      reason: "session_member_in_call",
    });
    expect(mock.upsertCalls).toHaveLength(0);
  });

  it("allows explicit leave room write even while in_call", async () => {
    const mock = createMockSb({ inCall: true });
    const result = await upsertClassPresenceGuarded({
      sb: mock.client,
      classId: "class-1",
      deviceId: "device-1",
      sessionId: "session-1",
      screen: "room",
      status: "waiting",
      source: "CallClient.markSelfLeftCall",
      reason: "leave_call",
      explicitLeave: true,
    });
    expect(result).toEqual({ ok: true, applied: true });
    expect(mock.upsertCalls).toHaveLength(1);
    expect(mock.upsertCalls[0]?.screen).toBe("room");
  });

  it("allows room heartbeat after leave when is_in_call=false", async () => {
    const mock = createMockSb({ inCall: false });
    const result = await upsertClassPresenceGuarded({
      sb: mock.client,
      classId: "class-1",
      deviceId: "device-1",
      sessionId: "session-1",
      screen: "room",
      status: "waiting",
      source: ROOM_PRESENCE_HEARTBEAT_SOURCE,
      reason: "heartbeat",
      explicitLeave: false,
    });
    expect(result).toEqual({ ok: true, applied: true });
    expect(mock.upsertCalls).toHaveLength(1);
  });

  it("repeated soft room writers while in_call never upsert", async () => {
    const mock = createMockSb({ inCall: true });
    const sources = [
      ROOM_PRESENCE_HEARTBEAT_SOURCE,
      SESSION_JOIN_REFRESH_ROOM_SOURCE,
      ENSURE_MEMBERSHIP_ROOM_SOURCE,
    ];

    for (let round = 0; round < 3; round += 1) {
      for (const source of sources) {
        const result = await upsertClassPresenceGuarded({
          sb: mock.client,
          classId: "class-1",
          deviceId: "device-1",
          sessionId: "session-1",
          screen: "room",
          status: "waiting",
          source,
          reason: "rejoin_race",
          explicitLeave: false,
        });
        expect(result.ok && !result.applied).toBe(true);
      }
    }

    expect(mock.upsertCalls).toHaveLength(0);
  });
});
