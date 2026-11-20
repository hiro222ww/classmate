import { bufferGraphql } from "@/lib/marketing/bufferClient";
import {
  getBufferChannelId,
  isBufferCredentialsPresent,
  isBufferPublishEnabled,
} from "@/lib/marketing/bufferConfig";
import type {
  MarketingPublishAdapter,
  PublishAdapterInput,
  PublishAdapterResult,
} from "@/lib/marketing/adapters/types";

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
  const joined = `${body}\n${url}`;
  return joined.length <= 280 ? joined : body;
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
