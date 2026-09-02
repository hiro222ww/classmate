/** How the user chose to start: voice call or text chat (future separate match pools). */
export type JoinMode = "call" | "chat";

export const JOIN_MODE_QUERY_KEY = "mode";

const JOIN_MODES: readonly JoinMode[] = ["call", "chat"];

export function isJoinMode(value: unknown): value is JoinMode {
  return JOIN_MODES.includes(String(value ?? "").trim() as JoinMode);
}

/** Defaults to call for backward-compatible /class/select links. */
export function parseJoinMode(value: unknown): JoinMode {
  const raw = String(value ?? "").trim();
  return isJoinMode(raw) ? raw : "call";
}

export function joinModeQuery(mode: JoinMode): string {
  return `${JOIN_MODE_QUERY_KEY}=${encodeURIComponent(mode)}`;
}

/** Theme select path with optional dev + mode query params. */
export function buildThemeSelectPath(
  mode: JoinMode,
  opts?: { dev?: string | null }
): string {
  const params = new URLSearchParams();
  params.set(JOIN_MODE_QUERY_KEY, mode);
  const dev = String(opts?.dev ?? "").trim();
  if (dev) {
    params.set("dev", dev);
  }
  return `/class/select?${params.toString()}`;
}

export function appendJoinModeToPath(path: string, mode: JoinMode): string {
  const url = new URL(path, "http://local");
  url.searchParams.set(JOIN_MODE_QUERY_KEY, mode);
  const query = url.searchParams.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

export type JoinModeCopy = {
  homeHeading: string;
  callLabel: string;
  callSubtitle: string;
  chatLabel: string;
  chatSubtitle: string;
  selectTitle: string;
  selectSubtitle: string;
};

export function joinModeCopy(mode: JoinMode): JoinModeCopy {
  const shared = {
    homeHeading: "どうやって始める？",
    callLabel: "🎙️ 通話から始める！",
    callSubtitle: "今すぐ誰かと話す",
    chatLabel: "💬 チャットから始める！",
    chatSubtitle: "メッセージから気軽に",
  };

  if (mode === "chat") {
    return {
      ...shared,
      selectTitle: "テーマを選んでチャットする",
      selectSubtitle: "フリーテーマから、気軽にメッセージできます",
    };
  }

  return {
    ...shared,
    selectTitle: "テーマを選んで通話する",
    selectSubtitle: "フリーテーマから、気軽に通話できます",
  };
}

export type PostJoinPathParams = {
  mode: JoinMode;
  classId: string;
  sessionId: string;
  devQuery?: string;
};

/** Client navigation after match-join: call → /call, chat → /room (no auto-call). */
export function buildPostJoinPath(params: PostJoinPathParams): string {
  const classId = String(params.classId ?? "").trim();
  const sessionId = String(params.sessionId ?? "").trim();
  const devSuffix = params.devQuery ? `&${params.devQuery}` : "";

  if (params.mode === "chat") {
    return (
      `/room?autojoin=1&classId=${encodeURIComponent(classId)}` +
      `&sessionId=${encodeURIComponent(sessionId)}${devSuffix}`
    );
  }

  return (
    `/call?sessionId=${encodeURIComponent(sessionId)}` +
    `&classId=${encodeURIComponent(classId)}${devSuffix}`
  );
}
