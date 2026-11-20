import { getBufferAccessToken } from "@/lib/marketing/bufferConfig";

export const BUFFER_API_URL = "https://api.buffer.com";

export type BufferGraphqlResult =
  | { ok: true; data: Record<string, unknown> }
  | {
      ok: false;
      error: string;
      detail?: string;
      retryable?: boolean;
    };

/**
 * Server-only Buffer GraphQL helper.
 * Never logs the access token or Authorization header.
 */
export async function bufferGraphql(params: {
  query: string;
  variables?: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<BufferGraphqlResult> {
  const token = getBufferAccessToken();
  if (!token) {
    return { ok: false, error: "buffer_token_missing", retryable: false };
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    params.timeoutMs ?? 30_000
  );

  try {
    const res = await fetch(BUFFER_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: params.query,
        variables: params.variables ?? {},
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
