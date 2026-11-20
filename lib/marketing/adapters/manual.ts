import type {
  MarketingPublishAdapter,
  PublishAdapterInput,
  PublishAdapterResult,
} from "@/lib/marketing/adapters/types";

/**
 * Manual / clipboard workflow — no external network publish.
 * Admin marks posts published after pasting to the SNS UI.
 */
export const manualPublishAdapter: MarketingPublishAdapter = {
  channel: "manual",
  isConfigured() {
    return true;
  },
  async publish(_input: PublishAdapterInput): Promise<PublishAdapterResult> {
    return {
      ok: false,
      error: "manual_only",
      retryable: false,
      detail:
        "External SNS is not connected. Copy body + UTM from the admin UI and post manually.",
    };
  },
};
