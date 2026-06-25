export type JoinByInviteSuccessCode = "joined" | "already_member";

export type JoinByInviteFailureCode =
  | "invalid_invite"
  | "expired_invite"
  | "class_full"
  | "age_restricted"
  | "needs_profile"
  | "restore_login"
  | "reregister_device"
  | "auth_required"
  | "server_error";

export type JoinByInviteCode = JoinByInviteSuccessCode | JoinByInviteFailureCode;

export type JoinByInviteSuccess = {
  ok: true;
  code: JoinByInviteSuccessCode;
  message: string;
  classId: string;
  sessionId: string;
  requestedSessionId: string;
  redirectTo: string;
  className: string;
  displayName: string;
  userId: string | null;
  deviceId: string;
  memberCount: number;
  sessionStatus: string | null;
  sessionFallback: boolean;
  sessionReactivated: boolean;
  sessionFallbackReason?: string | null;
  requestId: string;
};

export type JoinByInviteFailure = {
  ok: false;
  code: JoinByInviteFailureCode;
  message: string;
  redirectTo?: string;
  action?: string | null;
  requestId: string;
  classId?: string;
  sessionId?: string;
  detail?: string | null;
};

export type JoinByInviteResult = JoinByInviteSuccess | JoinByInviteFailure;

export function buildInviteRoomRedirect(params: {
  classId: string;
  sessionId: string;
  invite?: boolean;
}) {
  const search = new URLSearchParams({
    classId: params.classId,
    sessionId: params.sessionId,
    autojoin: "1",
  });
  if (params.invite) {
    search.set("invite", "1");
  }
  return `/room?${search.toString()}`;
}

export function joinByInviteUserMessage(code: JoinByInviteCode): string {
  switch (code) {
    case "joined":
      return "クラスに参加しました";
    case "already_member":
      return "すでにこのクラスに参加しています";
    case "invalid_invite":
      return "招待リンクが無効です。もう一度招待してもらってください";
    case "expired_invite":
      return "この招待リンクは期限切れです。もう一度招待してもらってください";
    case "class_full":
      return "参加できるクラス数の上限に達しています";
    case "age_restricted":
      return "年齢条件により、このクラスには参加できません";
    case "needs_profile":
      return "参加するにはプロフィール登録が必要です";
    case "restore_login":
      return "ログインが必要です";
    case "reregister_device":
      return "端末の再登録が必要です。しばらくしてからもう一度お試しください";
    case "auth_required":
      return "認証の準備ができていません。ページを再読み込みしてください";
    case "server_error":
      return "参加処理中にエラーが発生しました。しばらくしてからもう一度お試しください";
    default:
      return "クラスに参加できませんでした";
  }
}

export function mapLegacyInviteError(error: string): JoinByInviteFailureCode {
  const code = String(error ?? "").trim();
  if (
    code === "invite_expired" ||
    code === "session_closed" ||
    code === "session_not_joinable" ||
    code === "recruitment_closed" ||
    code === "match_deadline_passed"
  ) {
    return "expired_invite";
  }
  if (code === "class_slots_limit") return "class_full";
  if (
    code === "profile_age_required" ||
    code === "guardian_consent_required" ||
    code === "age_restricted"
  ) {
    return "age_restricted";
  }
  if (
    code === "missing_params" ||
    code === "class_not_found" ||
    code === "invalid_classId" ||
    code === "invalid_sessionId" ||
    code === "invalid_deviceId" ||
    code === "session_class_mismatch"
  ) {
    return "invalid_invite";
  }
  if (code === "device_secret_required" || code === "device_secret_mismatch") {
    return "restore_login";
  }
  if (code === "auth_required" || code === "device_id_required") {
    return "auth_required";
  }
  return "server_error";
}
