/**
 * Phase 2 SNS publish adapters.
 * Phase 1 does not call external APIs — operators copy text manually.
 */

export type PublishAdapterResult =
  | {
      ok: true;
      /** External post id when actually published or queued */
      externalPostId?: string;
      /** True when the network accepted a schedule (not yet live) */
      scheduledOnly?: boolean;
      /** Buffer dueAt (ISO UTC) when scheduled */
      dueAt?: string | null;
      raw?: unknown;
    }
  | {
      ok: false;
      error: string;
      retryable?: boolean;
      detail?: string;
    };

export type PublishAdapterInput = {
  postId: string;
  bodyText: string;
  trackingUrl: string | null;
  scheduledAt: string | null;
};

export interface MarketingPublishAdapter {
  readonly channel: "x" | "instagram" | "tiktok" | "buffer" | "manual";
  isConfigured(): boolean;
  publish(input: PublishAdapterInput): Promise<PublishAdapterResult>;
}
