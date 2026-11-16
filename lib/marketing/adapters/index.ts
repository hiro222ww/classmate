import { bufferPublishAdapter } from "@/lib/marketing/adapters/buffer";
import { manualPublishAdapter } from "@/lib/marketing/adapters/manual";
import type { MarketingPublishAdapter } from "@/lib/marketing/adapters/types";
import {
  getBufferConnectionStatus,
  isBufferCredentialsPresent,
  isBufferPublishEnabled,
} from "@/lib/marketing/bufferConfig";

/**
 * Resolve publish adapter for a channel.
 * Prefer Buffer when credentials + publish gate are set; otherwise manual.
 */
export function getPublishAdapter(
  _channel: string
): MarketingPublishAdapter {
  if (isBufferCredentialsPresent() && isBufferPublishEnabled()) {
    return bufferPublishAdapter;
  }
  // Credentials present but gate off → still return Buffer adapter so
  // callers get an explicit buffer_publish_disabled error (no network send).
  if (isBufferCredentialsPresent()) {
    return bufferPublishAdapter;
  }
  return manualPublishAdapter;
}

export function isExternalPublishConnected(): boolean {
  return getBufferConnectionStatus().connected;
}

export function getMarketingPublishStatus() {
  const buffer = getBufferConnectionStatus();
  return {
    buffer,
    activeAdapter: buffer.connected
      ? ("buffer" as const)
      : ("manual" as const),
  };
}
