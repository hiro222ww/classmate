import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSessionMembersSnapshot,
  readSessionMembersSnapshot,
  writeSessionMembersSnapshot,
} from "./sessionMembersSnapshot";

function createSessionStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe("sessionMembersSnapshot", () => {
  const sessionId = "11111111-1111-1111-1111-111111111111";
  const classId = "22222222-2222-2222-2222-222222222222";

  beforeEach(() => {
    const storage = createSessionStorageMock();
    Object.defineProperty(globalThis, "window", {
      value: {
        sessionStorage: storage,
      },
      configurable: true,
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      value: storage,
      configurable: true,
    });
  });

  it("round-trips members for the same session", () => {
    writeSessionMembersSnapshot(sessionId, classId, [
      { device_id: "device-a", display_name: "A" },
      { device_id: "device-b", display_name: "B" },
    ]);

    const snapshot = readSessionMembersSnapshot(sessionId, classId);
    expect(snapshot?.members).toHaveLength(2);
    expect(snapshot?.members.map((m) => m.device_id)).toEqual([
      "device-a",
      "device-b",
    ]);
  });

  it("returns null for mismatched session", () => {
    writeSessionMembersSnapshot(sessionId, classId, [
      { device_id: "device-a", display_name: "A" },
    ]);

    expect(
      readSessionMembersSnapshot("other-session", classId)
    ).toBeNull();
  });

  it("clears only the targeted class/session snapshot", () => {
    const otherClass = "33333333-3333-3333-3333-333333333333";
    writeSessionMembersSnapshot(sessionId, classId, [
      { device_id: "device-a", display_name: "A" },
    ]);
    writeSessionMembersSnapshot(sessionId, otherClass, [
      { device_id: "device-b", display_name: "B" },
    ]);

    clearSessionMembersSnapshot(sessionId, classId);

    expect(readSessionMembersSnapshot(sessionId, classId)).toBeNull();
    expect(readSessionMembersSnapshot(sessionId, otherClass)?.members).toHaveLength(
      1
    );
  });
});
