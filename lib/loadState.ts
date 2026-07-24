/** Shared async list / resource load phases for empty-vs-loading UI. */
export type LoadState = "idle" | "loading" | "loaded" | "empty" | "error";

export function resolveListLoadState(params: {
  hasFetched: boolean;
  loading: boolean;
  error?: string | null;
  count: number;
}): LoadState {
  if (params.error) return "error";
  if (!params.hasFetched || params.loading) return "loading";
  if (params.count <= 0) return "empty";
  return "loaded";
}

export function isLoadPending(state: LoadState): boolean {
  return state === "idle" || state === "loading";
}

export function formatMemberCountLabel(params: {
  state: LoadState;
  count: number;
  capacity?: number | null;
}): string {
  if (isLoadPending(params.state)) {
    return params.capacity != null ? `--/${params.capacity}人` : "確認中";
  }
  if (params.state === "error") {
    return params.capacity != null ? `?/${params.capacity}人` : "取得失敗";
  }
  if (params.capacity != null) {
    return `${Math.min(Math.max(params.count, 0), params.capacity)}/${params.capacity}人`;
  }
  return `${Math.max(params.count, 0)}人`;
}
