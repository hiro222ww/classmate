import { describe, expect, it } from "vitest";
import {
  formatMemberCountLabel,
  isLoadPending,
  resolveListLoadState,
} from "./loadState";

describe("loadState", () => {
  it("does not treat initial empty as empty until fetched", () => {
    expect(
      resolveListLoadState({ hasFetched: false, loading: false, count: 0 })
    ).toBe("loading");
    expect(
      resolveListLoadState({ hasFetched: true, loading: false, count: 0 })
    ).toBe("empty");
    expect(
      resolveListLoadState({ hasFetched: true, loading: false, count: 2 })
    ).toBe("loaded");
  });

  it("formats pending counts without showing 0", () => {
    expect(
      formatMemberCountLabel({ state: "loading", count: 0, capacity: 5 })
    ).toBe("--/5人");
    expect(isLoadPending("loading")).toBe(true);
  });
});
