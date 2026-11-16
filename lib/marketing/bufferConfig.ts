/** Buffer GraphQL credentials — server-side only. Never expose to the client. */

export function getBufferAccessToken(): string {
  return (
    process.env.BUFFER_ACCESS_TOKEN?.trim() ||
    process.env.BUFFER_API_KEY?.trim() ||
    ""
  );
}

export function getBufferChannelId(): string {
  return process.env.BUFFER_CHANNEL_ID?.trim() || "";
}

/**
 * Hard gate: even with tokens present, live Buffer mutations stay off until
 * the operator explicitly sets MARKETING_BUFFER_PUBLISH_ENABLED=1.
 */
export function isBufferPublishEnabled(): boolean {
  return String(process.env.MARKETING_BUFFER_PUBLISH_ENABLED ?? "").trim() === "1";
}

export function isBufferCredentialsPresent(): boolean {
  return Boolean(getBufferAccessToken() && getBufferChannelId());
}

export type BufferConnectionStatus = {
  credentialsPresent: boolean;
  publishEnabled: boolean;
  connected: boolean;
  channelIdConfigured: boolean;
  note: string;
};

export function getBufferConnectionStatus(): BufferConnectionStatus {
  const credentialsPresent = isBufferCredentialsPresent();
  const publishEnabled = isBufferPublishEnabled();
  const connected = credentialsPresent && publishEnabled;
  return {
    credentialsPresent,
    publishEnabled,
    connected,
    channelIdConfigured: Boolean(getBufferChannelId()),
    note: connected
      ? "Buffer接続済み（予約送信が有効）"
      : credentialsPresent
        ? "トークンは設定済みだが MARKETING_BUFFER_PUBLISH_ENABLED=1 まで送信しません"
        : "未接続（手動コピー運用）",
  };
}
