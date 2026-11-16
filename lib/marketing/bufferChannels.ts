import { bufferGraphql } from "@/lib/marketing/bufferClient";
import {
  getBufferAccessToken,
  getBufferChannelId,
  isBufferPublishEnabled,
} from "@/lib/marketing/bufferConfig";

export type BufferOrganization = {
  id: string;
  name: string;
};

export type BufferChannelSummary = {
  id: string;
  name: string;
  service: string;
  displayName: string | null;
  descriptor: string | null;
  externalLink: string | null;
  isDisconnected: boolean | null;
  isLocked: boolean | null;
  organizationId: string;
};

export type BufferChannelMatch = {
  handle: string;
  matched: BufferChannelSummary[];
  suggestedChannelId: string | null;
};

const ORGS_QUERY = `
query GetOrganizations {
  account {
    organizations {
      id
      name
    }
  }
}
`;

const CHANNELS_QUERY = `
query GetChannels($organizationId: OrganizationId!) {
  channels(input: { organizationId: $organizationId }) {
    id
    name
    service
    displayName
    descriptor
    externalLink
    isDisconnected
    isLocked
    organizationId
  }
}
`;

function normalizeHandle(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

function asChannel(row: Record<string, unknown>): BufferChannelSummary | null {
  const id = String(row.id ?? "").trim();
  const name = String(row.name ?? "").trim();
  const service = String(row.service ?? "").trim();
  if (!id || !name || !service) return null;
  return {
    id,
    name,
    service,
    displayName: row.displayName == null ? null : String(row.displayName),
    descriptor: row.descriptor == null ? null : String(row.descriptor),
    externalLink: row.externalLink == null ? null : String(row.externalLink),
    isDisconnected:
      typeof row.isDisconnected === "boolean" ? row.isDisconnected : null,
    isLocked: typeof row.isLocked === "boolean" ? row.isLocked : null,
    organizationId: String(row.organizationId ?? ""),
  };
}

export function findChannelsByHandle(
  channels: BufferChannelSummary[],
  handle: string
): BufferChannelMatch {
  const needle = normalizeHandle(handle);
  const matched = channels.filter((ch) => {
    const candidates = [
      ch.name,
      ch.displayName ?? "",
      ch.externalLink ?? "",
      ch.descriptor ?? "",
    ]
      .map(normalizeHandle)
      .filter(Boolean);
    return candidates.some(
      (c) => c === needle || c.includes(needle) || c.endsWith(`/${needle}`)
    );
  });

  const xFirst = matched.find((c) =>
    /twitter|x\b/i.test(String(c.service))
  );

  return {
    handle: needle,
    matched,
    suggestedChannelId: (xFirst ?? matched[0])?.id ?? null,
  };
}

export async function listBufferOrganizations(): Promise<
  | { ok: true; organizations: BufferOrganization[] }
  | { ok: false; error: string; detail?: string }
> {
  if (!getBufferAccessToken()) {
    return { ok: false, error: "buffer_token_missing" };
  }

  const gql = await bufferGraphql({ query: ORGS_QUERY });
  if (!gql.ok) {
    return { ok: false, error: gql.error, detail: gql.detail };
  }

  const account = gql.data.account as
    | { organizations?: Array<Record<string, unknown>> }
    | undefined;
  const orgs = (account?.organizations ?? [])
    .map((o) => ({
      id: String(o.id ?? "").trim(),
      name: String(o.name ?? "").trim() || "(unnamed)",
    }))
    .filter((o) => o.id);

  return { ok: true, organizations: orgs };
}

export async function listBufferChannels(params?: {
  organizationId?: string;
}): Promise<
  | {
      ok: true;
      organizations: BufferOrganization[];
      channels: BufferChannelSummary[];
    }
  | { ok: false; error: string; detail?: string }
> {
  const orgsResult = await listBufferOrganizations();
  if (!orgsResult.ok) return orgsResult;

  const orgs = orgsResult.organizations;
  if (orgs.length === 0) {
    return { ok: true, organizations: [], channels: [] };
  }

  const targetIds = params?.organizationId
    ? orgs.filter((o) => o.id === params.organizationId).map((o) => o.id)
    : orgs.map((o) => o.id);

  if (params?.organizationId && targetIds.length === 0) {
    return {
      ok: false,
      error: "organization_not_found",
      detail: params.organizationId,
    };
  }

  const channels: BufferChannelSummary[] = [];
  for (const organizationId of targetIds) {
    const gql = await bufferGraphql({
      query: CHANNELS_QUERY,
      variables: { organizationId },
    });
    if (!gql.ok) {
      return { ok: false, error: gql.error, detail: gql.detail };
    }
    const rows = (gql.data.channels as Array<Record<string, unknown>> | undefined) ?? [];
    for (const row of rows) {
      const ch = asChannel(row);
      if (ch) channels.push(ch);
    }
  }

  return { ok: true, organizations: orgs, channels };
}

/**
 * Read-only connection probe. Never creates posts.
 */
export async function probeBufferConnection(params?: {
  matchHandle?: string;
}): Promise<{
  ok: boolean;
  tokenPresent: boolean;
  channelIdConfigured: boolean;
  configuredChannelId: string | null;
  publishEnabled: boolean;
  apiReachable: boolean;
  error?: string;
  detail?: string;
  organizations: BufferOrganization[];
  channels: BufferChannelSummary[];
  match: BufferChannelMatch | null;
  publishCompatibility: {
    createScheduledSupported: boolean;
    createQueuedSupported: boolean;
    note: string;
  };
}> {
  const tokenPresent = Boolean(getBufferAccessToken());
  const configuredChannelId = getBufferChannelId() || null;
  const publishEnabled = isBufferPublishEnabled();

  const base = {
    tokenPresent,
    channelIdConfigured: Boolean(configuredChannelId),
    configuredChannelId,
    publishEnabled,
    organizations: [] as BufferOrganization[],
    channels: [] as BufferChannelSummary[],
    match: null as BufferChannelMatch | null,
    publishCompatibility: {
      createScheduledSupported: true,
      createQueuedSupported: true,
      note:
        "既存アダプタは createPost(mode: customScheduled | addToQueue) を使用。送信は MARKETING_BUFFER_PUBLISH_ENABLED=1 のときのみ。",
    },
  };

  if (!tokenPresent) {
    return {
      ...base,
      ok: false,
      apiReachable: false,
      error: "buffer_token_missing",
      detail: "Set BUFFER_ACCESS_TOKEN in .env.local (server-only).",
    };
  }

  const listed = await listBufferChannels();
  if (!listed.ok) {
    return {
      ...base,
      ok: false,
      apiReachable: false,
      error: listed.error,
      detail: listed.detail,
    };
  }

  const matchHandle = String(params?.matchHandle ?? "classmate0401").trim();
  const match = matchHandle
    ? findChannelsByHandle(listed.channels, matchHandle)
    : null;

  return {
    ...base,
    ok: true,
    apiReachable: true,
    organizations: listed.organizations,
    channels: listed.channels,
    match,
  };
}
