import { manualPublishAdapter } from "@/lib/marketing/adapters/manual";
import type { MarketingPublishAdapter } from "@/lib/marketing/adapters/types";

/**
 * Resolve publish adapter for a channel.
 * Phase 1: always manual. Phase 2: Buffer/X when env credentials exist.
 */
export function getPublishAdapter(
  channel: string
): MarketingPublishAdapter {
  void channel;
  // Future: if BUFFER_ACCESS_TOKEN → buffer adapter; if X_API_* → x adapter.
  return manualPublishAdapter;
}

export function isExternalPublishConnected(): boolean {
  return Boolean(
    process.env.BUFFER_ACCESS_TOKEN?.trim() ||
      process.env.X_API_KEY?.trim() ||
      process.env.MARKETING_SNS_PUBLISH_ENABLED === "1"
  );
}
