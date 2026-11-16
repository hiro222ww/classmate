/** Buffer GraphQL credentials — server-side only. Never expose keys to the client. */

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

export function isBufferTokenPresent(): boolean {
  return Boolean(getBufferAccessToken());
}

/** Token + channel id present (still may not publish if gate is off). */
export function isBufferCredentialsPresent(): boolean {
  return Boolean(getBufferAccessToken() && getBufferChannelId());
}

export type BufferConnectionStatus = {
  tokenPresent: boolean;
  credentialsPresent: boolean;
  publishEnabled: boolean;
  /** True only when credentialsPresent && publishEnabled */
  connected: boolean;
  channelIdConfigured: boolean;
  note: string;
};

export function getBufferConnectionStatus(): BufferConnectionStatus {
  const tokenPresent = isBufferTokenPresent();
  const credentialsPresent = isBufferCredentialsPresent();
  const publishEnabled = isBufferPublishEnabled();
  const connected = credentialsPresent && publishEnabled;
  let note: string;
  if (connected) {
    note = "Buffer接続済み（予約送信が有効）";
  } else if (credentialsPresent) {
    note =
      "トークンとチャンネルIDは設定済み。MARKETING_BUFFER_PUBLISH_ENABLED=1 まで送信しません";
  } else if (tokenPresent) {
    note =
      "ACCESS_TOKENは設定済み。BUFFER_CHANNEL_ID を設定し、接続確認で classmate0401 を特定してください";
  } else {
    note = "未接続（手動コピー運用）";
  }
  return {
    tokenPresent,
    credentialsPresent,
    publishEnabled,
    connected,
    channelIdConfigured: Boolean(getBufferChannelId()),
    note,
  };
}
