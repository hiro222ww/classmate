import { describe, expect, it, vi } from "vitest";
import { mapPool } from "@/lib/mapPool";

describe("mapPool", () => {
  it("preserves order with limited concurrency", async () => {
    const active = { current: 0, max: 0 };
    const results = await mapPool([1, 2, 3, 4, 5], 2, async (n) => {
      active.current += 1;
      active.max = Math.max(active.max, active.current);
      await new Promise((r) => setTimeout(r, 10));
      active.current -= 1;
      return n * 10;
    });
    expect(results).toEqual([10, 20, 30, 40, 50]);
    expect(active.max).toBeLessThanOrEqual(2);
  });

  it("returns empty for empty input", async () => {
    const mapper = vi.fn();
    await expect(mapPool([], 4, mapper)).resolves.toEqual([]);
    expect(mapper).not.toHaveBeenCalled();
  });
});
