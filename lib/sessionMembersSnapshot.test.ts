import { beforeEach, describe, expect, it } from "vitest";
import {
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
    Object.defineProperty(globalThis, "window", {
      value: {
        sessionStorage: createSessionStorageMock(),
      },
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
});
