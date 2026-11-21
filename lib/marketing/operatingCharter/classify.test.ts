import { describe, expect, it } from "vitest";
import { classifyCharterMemo } from "@/lib/marketing/operatingCharter/classify";
import type { CharterPolicyRow } from "@/lib/marketing/operatingCharter/types";

function policy(
  overrides: Partial<CharterPolicyRow> & Pick<CharterPolicyRow, "id" | "title" | "body">
): CharterPolicyRow {
  return {
    category: "prohibitions",
    importance: "critical",
    status: "active",
    priority_tier: 1,
    source: "manual",
    version: 1,
    fingerprint: "fp",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    activated_at: new Date().toISOString(),
    deactivated_at: null,
    ...overrides,
  };
}

describe("classifyCharterMemo", () => {
  it("classifies prohibition text as prohibitions/critical", () => {
    const r = classifyCharterMemo({
      sanitizedText: "運営上の禁止事項: 個人情報の無断送信を禁止する",
      activePolicies: [],
    });
    expect(r.category).toBe("prohibitions");
    expect(r.importance).toBe("critical");
  });

  it("marks ideas as idea_unadopted", () => {
    const r = classifyCharterMemo({
      sanitizedText: "試したいアイデア: 金曜夜に雑談テーマ投稿を増やす実験",
      activePolicies: [],
    });
    expect(r.category).toBe("idea");
    expect(r.suggestedStatus).toBe("idea_unadopted");
  });

  it("detects conflict with important active prohibition", () => {
    const active = [
      policy({
        id: "p1",
        title: "出会い目的禁止",
        body: "出会い目的・連絡先交換の表現は禁止する",
        priority_tier: 1,
      }),
    ];
    const r = classifyCharterMemo({
      sanitizedText: "出会い目的の表現を積極的に増やして集客する",
      activePolicies: active,
    });
    expect(r.conflicts.length).toBeGreaterThan(0);
    expect(r.suggestedStatus).toBe("pending_approval");
  });

  it("flags near-duplicate of existing policy", () => {
    const active = [
      policy({
        id: "p2",
        category: "sns",
        title: "押し売り禁止",
        body: "今すぐ登録の連発や押し売り口調は避ける",
        priority_tier: 3,
        importance: "high",
      }),
    ];
    const r = classifyCharterMemo({
      sanitizedText: "今すぐ登録の連発や押し売り口調は避ける",
      activePolicies: active,
    });
    expect(r.duplicateOf?.id).toBe("p2");
  });
});
