import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  buildMatchedCallPath,
  prepareMatchedCallEntry,
  resolveMatchJoinSessionIds,
} from "@/lib/enterMatchedCallClient";
import { hasAutoCallOnce } from "@/lib/autoCallOnce";

describe("enterMatchedCallClient", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      location: { search: "" },
    });
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds /call path for matched sessions", () => {
    expect(buildMatchedCallPath("class-1", "sess-1")).toContain("/call?");
    expect(buildMatchedCallPath("class-1", "sess-1")).toContain("classId=class-1");
    expect(buildMatchedCallPath("class-1", "sess-1")).toContain("sessionId=sess-1");
  });

  it("prepareMatchedCallEntry marks auto-call and returns call path", () => {
    const result = prepareMatchedCallEntry({
      classId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      sessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      deviceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.callPath).toContain("/call?");
    expect(
      hasAutoCallOnce(
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
      )
    ).toBe(true);
  });

  it("resolves ids from match-join json shapes", () => {
    expect(
      resolveMatchJoinSessionIds({
        classId: "c1",
        sessionId: "s1",
      })
    ).toEqual({ classId: "c1", sessionId: "s1" });
    expect(
      resolveMatchJoinSessionIds({
        data: [{ class_id: "c2", session_id: "s2" }],
      })
    ).toEqual({ classId: "c2", sessionId: "s2" });
  });
});
