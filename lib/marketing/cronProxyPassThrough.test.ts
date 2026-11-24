import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guardrail: Edge proxy must not require CRON_SECRET to reach marketing cron
 * routes. Secret-type env vars are often empty on Edge, so Vercel Cron
 * (Authorization Bearer only) was 401'd before Node handlers ran — no Discord
 * digest and no daily X drafts.
 */
describe("marketing cron proxy pass-through", () => {
  const proxy = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");

  it("lists all marketing cron paths", () => {
    expect(proxy).toContain('"/api/admin/marketing/cron"');
    expect(proxy).toContain('"/api/admin/marketing/cron/digest"');
    expect(proxy).toContain('"/api/admin/marketing/cron/weekly"');
  });

  it("passes cron APIs through without Edge secret matching", () => {
    const blockStart = proxy.indexOf("const isMarketingCronApi");
    expect(blockStart).toBeGreaterThan(-1);
    const afterFlag = proxy.indexOf("if (isMarketingCronApi)", blockStart);
    const block = proxy.slice(afterFlag, afterFlag + 400);
    expect(block).toMatch(/return NextResponse\.next\(\)/);
    expect(block).not.toMatch(/process\.env\.CRON_SECRET/);
    expect(block).not.toMatch(/unique\.includes/);
  });
});
