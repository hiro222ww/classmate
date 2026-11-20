import { SITE_ORIGIN } from "@/lib/seo";
import type { MarketingChannel } from "@/lib/marketing/types";

export function buildMarketingTrackingUrl(params: {
  channel: MarketingChannel;
  campaign?: string;
  content: string;
  origin?: string;
}): string {
  const origin = (params.origin || SITE_ORIGIN).replace(/\/$/, "");
  const source =
    params.channel === "manual" ? "manual" : params.channel === "x" ? "x" : params.channel;
  const qs = new URLSearchParams({
    utm_source: source,
    utm_medium: "social",
    utm_campaign: params.campaign?.trim() || "ai_marketing",
    utm_content: params.content.trim() || "post",
  });
  return `${origin}/?${qs.toString()}`;
}

export function truncateForX(body: string, max = 140): string {
  const t = String(body ?? "").trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1)).trim()}…`;
}
