import {
  getBufferAccessToken,
  getBufferChannelId,
  isBufferCredentialsPresent,
  isBufferPublishEnabled,
} from "@/lib/marketing/bufferConfig";
import type {
  MarketingPublishAdapter,
  PublishAdapterInput,
  PublishAdapterResult,
} from "@/lib/marketing/adapters/types";

const BUFFER_API = "https://api.buffer.com";

const CREATE_SCHEDULED_MUTATION = `
mutation CreateScheduledPost($text: String!, $channelId: String!, $dueAt: DateTime!) {
  createPost(input: {
    text: $text
    channelId: $channelId
    schedulingType: automatic
    mode: customScheduled
    dueAt: $dueAt
  }) {
    ... on PostActionSuccess {
      post {
        id
        text
        dueAt
        status
      }
    }
    ... on MutationError {
      message
    }
  }
}
`;

const CREATE_QUEUE_MUTATION = `
mutation CreateQueuedPost($text: String!, $channelId: String!) {
  createPost(input: {
    text: $text
    channelId: $channelId
    schedulingType: automatic
    mode: addToQueue
  }) {
    ... on PostActionSuccess {
      post {
        id
        text
        dueAt
        status
      }
    }
    ... on MutationError {
      message
    }
  }
}
`;

type BufferPostPayload = {
  id?: string;
  text?: string;
  dueAt?: string;
  status?: string;
};

function composeBufferText(input: PublishAdapterInput): string {
  const body = String(input.bodyText ?? "").trim();
  const url = String(input.trackingUrl ?? "").trim();
  if (!url) return body;
  if (body.includes(url)) return body;
  // Keep under ~280 for X; body is already ~140 from generation.
  const joined = `${body}\n${url}`;
  return joined.length <= 280 ? joined : body;
}

async function bufferGraphql(params: {
  query: string;
  variables: Record<string, unknown>;
}): Promise<
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string; detail?: string; retryable?: boolean }
> {
  const token = getBufferAccessToken();
  if (!token) {
    return { ok: false, error: "buffer_token_missing", retryable: false };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(BUFFER_API, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: params.query,
        variables: params.variables,
      }),
    });

    const json = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!res.ok) {
      return {
        ok: false,
        error: "buffer_http_error",
        detail: `HTTP ${res.status}`,
        retryable: res.status >= 500 || res.status === 429,
      };
    }

    if (Array.isArray(json?.errors) && (json.errors as unknown[]).length > 0) {
      const first = (json.errors as Array<{ message?: string }>)[0];
      return {
        ok: false,
        error: "buffer_graphql_error",
        detail: first?.message || "graphql_error",
        retryable: true,
      };
    }

    if (!json?.data || typeof json.data !== "object") {
      return { ok: false, error: "buffer_empty_data", retryable: true };
    }

    return { ok: true, data: json.data as Record<string, unknown> };
  } catch (e) {
    const message = e instanceof Error ? e.message : "buffer_fetch_failed";
    return {
      ok: false,
      error: message.includes("abort") ? "buffer_timeout" : "buffer_fetch_failed",
      detail: message,
      retryable: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseCreatePostResult(
  data: Record<string, unknown>
): PublishAdapterResult {
  const createPost = data.createPost as
    | { post?: BufferPostPayload; message?: string }
    | null
    | undefined;

  if (!createPost) {
    return { ok: false, error: "buffer_missing_createPost", retryable: true };
  }

  if (typeof createPost.message === "string" && createPost.message) {
    return {
      ok: false,
      error: "buffer_mutation_error",
      detail: createPost.message,
      retryable: /rate|limit|timeout|try again/i.test(createPost.message),
    };
  }

  const post = createPost.post;
  if (!post?.id) {
    return { ok: false, error: "buffer_missing_post_id", retryable: true };
  }

  const status = String(post.status ?? "").toLowerCase();
  const sent = status === "sent" || status === "published";

  return {
    ok: true,
    externalPostId: String(post.id),
    scheduledOnly: !sent,
    dueAt: post.dueAt ? String(post.dueAt) : null,
    raw: post,
  };
}

export const bufferPublishAdapter: MarketingPublishAdapter = {
  channel: "buffer",

  isConfigured() {
    return isBufferCredentialsPresent() && isBufferPublishEnabled();
  },

  async publish(input: PublishAdapterInput): Promise<PublishAdapterResult> {
    if (!isBufferCredentialsPresent()) {
      return {
        ok: false,
        error: "buffer_not_configured",
        retryable: false,
        detail: "Set BUFFER_ACCESS_TOKEN and BUFFER_CHANNEL_ID.",
      };
    }

    if (!isBufferPublishEnabled()) {
      return {
        ok: false,
        error: "buffer_publish_disabled",
        retryable: false,
        detail:
          "Credentials may exist, but MARKETING_BUFFER_PUBLISH_ENABLED is not 1. No network publish performed.",
      };
    }

    const channelId = getBufferChannelId();
    const text = composeBufferText(input);
    if (!text) {
      return { ok: false, error: "empty_body", retryable: false };
    }

    const dueAt = input.scheduledAt
      ? new Date(input.scheduledAt).toISOString()
      : null;

    if (dueAt && Number.isNaN(new Date(dueAt).getTime())) {
      return { ok: false, error: "invalid_scheduled_at", retryable: false };
    }

    const gql = dueAt
      ? await bufferGraphql({
          query: CREATE_SCHEDULED_MUTATION,
          variables: { text, channelId, dueAt },
        })
      : await bufferGraphql({
          query: CREATE_QUEUE_MUTATION,
          variables: { text, channelId },
        });

    if (!gql.ok) {
      return {
        ok: false,
        error: gql.error,
        detail: gql.detail,
        retryable: gql.retryable,
      };
    }

    return parseCreatePostResult(gql.data);
  },
};
