import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAdminNotifyChannelCapability,
  notifyAdminsOfProposals,
} from "@/lib/marketing/adminNotify";
import type { ImprovementProposalRow } from "@/lib/marketing/proposals";

function chain(result: { data: unknown; error: null }) {
  const api: Record<string, unknown> = {};
  const self = new Proxy(api, {
    get(_t, prop: string) {
      if (prop === "then") return undefined;
      if (prop === "insert" || prop === "update") {
        return () => self;
      }
      if (prop === "in") {
        return async () => result;
      }
      if (prop === "limit") {
        return async () => result;
      }
      return () => self;
    },
  });
  return self;
}

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: () => chain({ data: [], error: null }),
  },
}));

vi.mock("@/lib/emailSender", () => ({
  isTransactionalEmailConfigured: () => true,
  sendTransactionalEmail: vi.fn(async () => ({ ok: true, id: "test" })),
}));

const sampleProposal = (id: string): ImprovementProposalRow => ({
  id,
  source_report_id: null,
  category: "ui_ux",
  area: "home_hero",
  title: "テスト提案",
  summary: "概要です",
  detail_markdown: null,
  priority: "high",
  status: "pending",
  fingerprint: "abc",
  evidence_kind: "hypothesis",
  validation_kpi: null,
  image_prompt: null,
  composition_notes: null,
  metrics_context: {},
  notified_at: null,
  notification_channel: null,
  reviewed_at: null,
  review_note: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

beforeEach(() => {
  delete process.env.MARKETING_ADMIN_NOTIFY_ENABLED;
  delete process.env.MARKETING_ADMIN_NOTIFY_EMAIL;
});

afterEach(() => {
  delete process.env.MARKETING_ADMIN_NOTIFY_ENABLED;
  delete process.env.MARKETING_ADMIN_NOTIFY_EMAIL;
  vi.clearAllMocks();
});

describe("getAdminNotifyChannelCapability", () => {
  it("reports web push cannot target admins", () => {
    const c = getAdminNotifyChannelCapability();
    expect(c.webPushCanTargetAdmins).toBe(false);
    expect(["email", "none"]).toContain(c.preferred);
  });
});

describe("notifyAdminsOfProposals", () => {
  it("stays disabled by default without sending", async () => {
    const result = await notifyAdminsOfProposals({
      kind: "weekly_digest",
      proposals: [sampleProposal("p1")],
      reportId: "r1",
    });
    expect(result.status).toBe("disabled");
    expect(result.ok).toBe(true);
  });

  it("fails closed when enabled but email missing", async () => {
    process.env.MARKETING_ADMIN_NOTIFY_ENABLED = "1";
    const result = await notifyAdminsOfProposals({
      kind: "urgent_proposal",
      proposals: [sampleProposal("p2")],
    });
    expect(result.status).toBe("failed");
    expect(result.error).toBe("admin_email_missing");
  });
});
