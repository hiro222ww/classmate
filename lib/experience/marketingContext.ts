import { loadRelevantEvent } from "@/lib/experience/status";
import { isExperienceFeatureEnabled } from "@/lib/experience/settings";
import { formatJstDateTime } from "@/lib/experience/time";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Facts-only marketing addon for AI generation.
 * Never invents attendance or past results.
 */
export async function buildExperienceMarketingAddon(): Promise<string | null> {
  const enabled = await isExperienceFeatureEnabled();
  if (!enabled) return null;

  const event = await loadRelevantEvent();
  if (!event) {
    return [
      "【体験会（期間限定）】",
      "現在、公開中の体験会開催予定はありません。",
      "存在しない開催実績・参加人数を書かないこと。",
    ].join("\n");
  }

  const now = Date.now();
  const starts = new Date(event.starts_at).getTime();
  const ends = new Date(event.ends_at).getTime();
  const phase =
    now < starts ? "upcoming" : now < ends ? "live" : "ended";

  const lines = [
    "【体験会（期間限定・暫定施策）】",
    `タイトル: ${event.title}`,
    `開始（JST）: ${formatJstDateTime(event.starts_at)}`,
    `終了（JST）: ${formatJstDateTime(event.ends_at)}`,
    `定員: 最大${event.max_members}人（1人から参加可）`,
    `状態: ${phase === "upcoming" ? "開催前" : phase === "live" ? "開催中" : "終了"}`,
    "書き方:",
    "- 開催予告は上記日時のみを事実として使う",
    "- 参加人数・満席・過去実績は実測がない限り書かない",
    "- 体験会は主力機能ではなく、ランダム通話・マイクラスの補助導線",
    "- 承認前に自動投稿しない（従来どおり下書き→承認）",
  ];

  if (phase === "live" && event.session_id) {
    const { count } = await supabaseAdmin
      .from("session_members")
      .select("device_id", { count: "exact", head: true })
      .eq("session_id", event.session_id)
      .not("device_id", "is", null)
      .neq("device_id", "");
    if (typeof count === "number") {
      lines.push(`現在の入室人数（実測）: ${count}人`);
    }
  }

  return lines.join("\n");
}
