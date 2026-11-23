import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("experience_event_join SQL capacity guards", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20261123120000_experience_sessions.sql"),
    "utf8"
  );
  const capacitySql = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20261123140000_experience_capacity_current_in_call.sql"
    ),
    "utf8"
  );

  it("enforces max members and rolls back over-capacity joins", () => {
    expect(sql).toMatch(/v_member_count >= v_event\.max_members/);
    expect(sql).toMatch(/v_member_count > v_event\.max_members/);
    expect(sql).toMatch(/error', 'event_full'/);
    expect(sql).toMatch(/FOR UPDATE/);
  });

  it("counts only current in-call members for capacity (not cumulative)", () => {
    expect(capacitySql).toMatch(/sm\.is_in_call IS TRUE/);
    expect(capacitySql).toMatch(/v_already_in_call/);
    expect(capacitySql).toMatch(/NOT v_already_in_call AND v_member_count >=/);
  });

  it("keeps feature default OFF and additive tables only", () => {
    expect(sql).toMatch(/experience_sessions_feature_enabled/);
    expect(sql).toMatch(/'false'::jsonb/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.experience_events/);
    expect(sql).not.toMatch(/DROP TABLE/);
    expect(sql).not.toMatch(/match_join_atomic/);
  });

  it("uses existing world_key default (FK-safe) instead of inventing experience world", () => {
    expect(sql).toMatch(/'default'/);
    expect(sql).not.toMatch(/'experience',\s*\n\s*'experience_session'/);
  });
});
