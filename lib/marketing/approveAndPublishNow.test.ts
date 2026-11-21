import { afterEach, describe, expect, it, vi } from "vitest";

const mockFrom = vi.fn();
const mockBufferPublish = vi.fn();
const mockListPolicies = vi.fn();
const mockSendDiscord = vi.fn();
const mockAudit = vi.fn();

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

vi.mock("@/lib/marketing/adapters/buffer", () => ({
  bufferPublishAdapter: {
    publish: (...args: unknown[]) => mockBufferPublish(...args),
  },
}));

vi.mock("@/lib/marketing/immediatePublishSettings", () => ({
  isImmediatePublishEnabled: vi.fn(async () => true),
}));

vi.mock("@/lib/marketing/operatingCharter/store", () => ({
  listActivePolicies: (...args: unknown[]) => mockListPolicies(...args),
}));

vi.mock("@/lib/marketing/discordWebhook", () => ({
  isDiscordWebhookConfigured: () => false,
  sendDiscordWebhookMessage: (...args: unknown[]) => mockSendDiscord(...args),
}));

vi.mock("@/lib/adminAuditLog", () => ({
  writeAdminAuditLog: (...args: unknown[]) => mockAudit(...args),
}));

function chain(result: { data: unknown; error: null | { message: string } }) {
  const api: Record<string, unknown> = {};
  const self = () => api;
  for (const m of [
    "select",
    "eq",
    "is",
    "or",
    "update",
    "maybeSingle",
  ]) {
    api[m] = vi.fn(self);
  }
  api.maybeSingle = vi.fn(async () => result);
  return api;
}

afterEach(() => {
  vi.resetAllMocks();
  vi.resetModules();
});

describe("approveAndPublishNow", () => {
  it("dryRun claims then releases without Buffer call", async () => {
    mockListPolicies.mockResolvedValue([]);
    const draft = {
      id: "11111111-1111-1111-1111-111111111111",
      status: "draft",
      body_text: "hello classmate",
      tracking_url: "https://example.test/?utm=1",
      external_post_id: null,
      publish_attempts: 0,
      scheduled_at: null,
    };
    const load = chain({ data: draft, error: null });
    const claim = chain({
      data: { ...draft, status: "approved", publish_claim_token: "tok" },
      error: null,
    });
    const release = chain({ data: draft, error: null });
    mockFrom
      .mockReturnValueOnce(load) // load
      .mockReturnValueOnce(claim) // claim update
      .mockReturnValueOnce(release); // release after dryRun

    const { approveAndPublishNow } = await import(
      "@/lib/marketing/approveAndPublishNow"
    );
    const result = await approveAndPublishNow({
      postId: draft.id,
      actor: "test",
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(mockBufferPublish).not.toHaveBeenCalled();
  });

  it("refuses double send when external_post_id exists", async () => {
    mockListPolicies.mockResolvedValue([]);
    const load = chain({
      data: {
        id: "22222222-2222-2222-2222-222222222222",
        status: "scheduled",
        body_text: "queued",
        external_post_id: "buffer-already",
        publish_attempts: 1,
      },
      error: null,
    });
    mockFrom.mockReturnValueOnce(load);

    const { approveAndPublishNow } = await import(
      "@/lib/marketing/approveAndPublishNow"
    );
    const result = await approveAndPublishNow({
      postId: "22222222-2222-2222-2222-222222222222",
      actor: "test",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("already_sent");
    expect(mockBufferPublish).not.toHaveBeenCalled();
  });
});
