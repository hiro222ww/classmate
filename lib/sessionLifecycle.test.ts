import { describe, expect, it, vi } from "vitest";
import { closeEmptySessionIfNeeded } from "./sessionLifecycle";

type MemberRow = { device_id: string | null };

function createMockSb(params: {
  remainingMembers: MemberRow[];
  liveExperience?: boolean;
  onClose?: (sessionId: string) => void;
}) {
  const sessionUpdateEq = vi.fn(async () => ({ error: null }));
  const sessionUpdate = vi.fn((_payload?: { status: string }) => ({
    eq: sessionUpdateEq,
  }));

  const membersNeq = vi.fn(async () => ({
    data: params.remainingMembers,
    error: null,
  }));
  const membersNot = vi.fn(() => ({ neq: membersNeq }));
  const membersEq = vi.fn(() => ({ not: membersNot }));
  const membersSelect = vi.fn(() => ({ eq: membersEq }));

  const experienceMaybeSingle = vi.fn(async () => ({
    data: params.liveExperience ? { id: "exp-1" } : null,
    error: null,
  }));
  const experienceLimit = vi.fn(() => ({ maybeSingle: experienceMaybeSingle }));
  const experienceGt = vi.fn(() => ({ limit: experienceLimit }));
  const experienceStatusEq = vi.fn(() => ({ gt: experienceGt }));
  const experienceSessionEq = vi.fn(() => ({ eq: experienceStatusEq }));
  const experienceSelect = vi.fn(() => ({ eq: experienceSessionEq }));

  const from = vi.fn((table: string) => {
    if (table === "session_members") {
      return { select: membersSelect };
    }
    if (table === "experience_events") {
      return { select: experienceSelect };
    }
    if (table === "sessions") {
      return {
        update: (payload: { status: string }) => {
          expect(payload).toEqual({ status: "closed" });
          return sessionUpdate(payload);
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  return {
    client: { from } as never,
    sessionUpdateEq,
    sessionUpdate,
    onCloseHook: params.onClose,
  };
}

describe("closeEmptySessionIfNeeded", () => {
  it("closes the session when prune leaves zero members", async () => {
    const { client, sessionUpdateEq, sessionUpdate } = createMockSb({
      remainingMembers: [],
      liveExperience: false,
    });

    const result = await closeEmptySessionIfNeeded(
      client,
      "11111111-1111-1111-1111-111111111111"
    );

    expect(result).toEqual({ closed: true, remaining: 0 });
    expect(sessionUpdate).toHaveBeenCalledWith({ status: "closed" });
    expect(sessionUpdateEq).toHaveBeenCalledWith(
      "id",
      "11111111-1111-1111-1111-111111111111"
    );
  });

  it("keeps empty experience rooms open while the event is live", async () => {
    const { client, sessionUpdate } = createMockSb({
      remainingMembers: [],
      liveExperience: true,
    });

    const result = await closeEmptySessionIfNeeded(
      client,
      "33333333-3333-3333-3333-333333333333"
    );

    expect(result).toEqual({ closed: false, remaining: 0 });
    expect(sessionUpdate).not.toHaveBeenCalled();
  });

  it("keeps active when one or more members remain", async () => {
    const { client, sessionUpdate } = createMockSb({
      remainingMembers: [{ device_id: "device-a" }],
    });

    const result = await closeEmptySessionIfNeeded(
      client,
      "22222222-2222-2222-2222-222222222222"
    );

    expect(result).toEqual({ closed: false, remaining: 1 });
    expect(sessionUpdate).not.toHaveBeenCalled();
  });
});
