import { describe, expect, it } from "vitest";
import {
  checkTextAgainstCharter,
  charterSnapshotForReport,
} from "@/lib/marketing/operatingCharter/compliance";
import { buildCharterPromptAddon } from "@/lib/marketing/operatingCharter/prompt";
import { alignProposalsWithCharter } from "@/lib/marketing/operatingCharter/alignProposals";
import type { CharterPolicyRow } from "@/lib/marketing/operatingCharter/types";
import type { ProposalDraft } from "@/lib/marketing/proposals";

function policy(
  overrides: Partial<CharterPolicyRow> & Pick<CharterPolicyRow, "id" | "title" | "body">
): CharterPolicyRow {
  return {
    category: "prohibitions",
    importance: "critical",
    status: "active",
    priority_tier: 1,
    source: "manual",
    version: 2,
    fingerprint: "fp",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    activated_at: new Date().toISOString(),
    deactivated_at: null,
    ...overrides,
  };
}

describe("checkTextAgainstCharter", () => {
  it("flags builtin safety phrases", () => {
    const r = checkTextAgainstCharter({
      text: "今すぐ登録！すぐ友達ができるよ",
      policies: [],
    });
    expect(r.status).toBe("needs_review");
    expect(r.conflicts.some((c) => c.policyId === "builtin-safety")).toBe(true);
  });

  it("returns ok for compliant copy", () => {
    const r = checkTextAgainstCharter({
      text: "同年代と気軽に通話できる場を少しずつ整えています。",
      policies: [
        policy({
          id: "p1",
          title: "押し売り禁止",
          body: "禁止: 今すぐ登録の連発",
        }),
      ],
    });
    expect(r.status).toBe("ok");
  });
});

describe("buildCharterPromptAddon", () => {
  it("orders by tier and omits ideas by default", () => {
    const addon = buildCharterPromptAddon([
      policy({
        id: "i1",
        category: "idea",
        title: "実験",
        body: "金曜に投稿を増やす",
        priority_tier: 5,
        status: "active",
      }),
      policy({
        id: "p1",
        title: "理念",
        body: "押し売りしない",
        category: "philosophy",
        priority_tier: 2,
      }),
    ]);
    expect(addon).toContain("押し売りしない");
    expect(addon).not.toContain("金曜に投稿");
    expect(addon).toContain("優先順位");
  });
});

describe("charterSnapshotForReport", () => {
  it("includes version and priority order", () => {
    const snap = charterSnapshotForReport([
      policy({ id: "p1", title: "A", body: "B", version: 3 }),
    ]);
    expect(snap.priorityOrder[0]).toBe("1_laws_safety_privacy");
    expect(snap.active[0].version).toBe(3);
  });
});

describe("alignProposalsWithCharter", () => {
  it("annotates drafts with alignment and does not auto-accept", () => {
    const drafts: ProposalDraft[] = [
      {
        category: "copy",
        area: "catchcopy",
        title: "今すぐ登録を全面に",
        summary: "今すぐ登録！で押し出す",
        detail_markdown: "今すぐ登録を強調",
        priority: "high",
      },
    ];
    const out = alignProposalsWithCharter({
      drafts,
      policies: [
        policy({
          id: "p1",
          title: "押し売り禁止",
          body: "禁止: 今すぐ登録",
        }),
      ],
    });
    expect(out[0].charter_alignment).toMatch(/needs_review/);
    expect(out[0].detail_markdown).toContain("運営憲章との整合");
    expect(out[0].charter_policy_ids).toContain("p1");
  });
});
