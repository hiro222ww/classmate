const DEFAULT_ENTRY_FAILURE_MESSAGE =
  "入校に失敗しました。通信環境または端末情報の状態が原因の可能性があります。時間をおいて再試行するか、端末情報をリセットして入り直してください。";

export function resolveMatchJoinUserMessage(
  error: string | null | undefined,
  fallbackMessage?: string | null
): string {
  const code = String(error ?? "").trim();
  if (fallbackMessage?.trim()) return fallbackMessage.trim();

  switch (code) {
    case "profile_required":
      return "プロフィール登録後にクラスへ参加できます。";
    case "profile_age_required":
      return "生年月日が未設定です。プロフィールを登録してから再度お試しください。";
    case "invalid_deviceId":
    case "device_id_invalid":
      return "端末情報の形式が古い可能性があります。「端末情報をリセットして入り直す」をお試しください。";
    case "class_slots_limit":
      return "参加できるクラス数の上限に達しています。";
    case "admission_closed":
    case "match_deadline_passed":
      return "現在は入校受付時間外です。受付時間になったら、もう一度お試しください。";
    case "recruitment_closed":
      return "このクラスは現在募集していません。";
    case "gender_restricted_topic":
      return "このテーマは参加条件により利用できません。";
    case "adult_only":
    case "minors_disabled":
      return "現在このサービスは18歳以上のみ利用できます。";
    case "sensitive_topic_adult_only":
    case "topic_min_age":
      return "このテーマは利用条件により参加できません。";
    case "contact_exchange_blocked":
      return "連絡先交換や待ち合わせの誘導に見える内容は投稿できません。";
    case "membership_left":
      return "このクラスから退出済みのため、再参加できません。";
    case "match_join_incomplete":
    case "membership_upsert_failed":
    case "session_member_upsert_failed":
    case "presence_upsert_failed":
    case "join_state_failed":
      return DEFAULT_ENTRY_FAILURE_MESSAGE;
    case "server_error":
    case "profile_lookup_failed":
    case "match_prefs_lookup_failed":
      return DEFAULT_ENTRY_FAILURE_MESSAGE;
    default:
      return code ? DEFAULT_ENTRY_FAILURE_MESSAGE : DEFAULT_ENTRY_FAILURE_MESSAGE;
  }
}

export const ENTRY_FAILURE_DEFAULT_MESSAGE = DEFAULT_ENTRY_FAILURE_MESSAGE;
