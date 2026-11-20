import type { GeneratedPostDraft, MarketingPostType } from "@/lib/marketing/types";
import { buildMarketingTrackingUrl } from "@/lib/marketing/utm";
import { scoreMarketingDraft } from "@/lib/marketing/quality";

export type CalendarPostPlan = GeneratedPostDraft & {
  dayOffset: number; // 0 = start day
  hourJst: number;
  minuteJst: number;
  effectHypothesis: string;
  includeUtm: boolean;
  utmContent: string;
};

/**
 * Curated 14-day X calendar (hypothesis times).
 * No invented testimonials or unconfirmed events.
 * Event posts are framed as「検討中の企画案」or soft invites, never as confirmed schedules.
 */
export function buildTwoWeekCalendarPlans(startYmd: string): CalendarPostPlan[] {
  const plans: Array<Omit<CalendarPostPlan, "utmContent"> & { utmContent?: string }> = [
    {
      dayOffset: 0,
      hourJst: 12,
      minuteJst: 30,
      post_type: "empathy",
      body_text:
        "社会人になると、ただ雑談する相手がいなくなる。仕事の話でも恋愛相談でもなく、今日あったどうでもいい話をしたい——そういう夜、ありませんか。",
      purpose: "共感でタイムラインに留まる",
      target_audience: "18〜29歳で話し相手が欲しい人",
      expected_action: "いいね・引用で共感を示す",
      cta: "",
      effectHypothesis: "フォロワー外へのリーチ（共感）",
      includeUtm: false,
    },
    {
      dayOffset: 0,
      hourJst: 21,
      minuteJst: 0,
      post_type: "question",
      body_text:
        "ひとりの夜、どっちが多い？ A) 誰かと話したいけど相手が思いつかない B) 話したい気持ち自体がわかない",
      purpose: "返信を促し交流の種を作る",
      target_audience: "夜にTLを見ている同年代",
      expected_action: "リプライでA/Bを答える",
      cta: "",
      effectHypothesis: "返信によるアルゴリズム評価",
      includeUtm: false,
    },
    {
      dayOffset: 1,
      hourJst: 13,
      minuteJst: 0,
      post_type: "intro",
      body_text:
        "Classmateは、同年代と気軽に通話できる音声コミュニティです。テーマ別の少人数クラス（最大5人くらい）で、友だちづくりのきっかけを作れます。",
      purpose: "サービス認知",
      target_audience: "音声コミュニティに興味がある人",
      expected_action: "プロフィールまたはリンクを開く",
      cta: "気になったらプロフィールのリンクから",
      effectHypothesis: "プロフィール流入",
      includeUtm: true,
    },
    {
      dayOffset: 2,
      hourJst: 20,
      minuteJst: 30,
      post_type: "story",
      body_text:
        "テキストのSNSは続くのに、声で話す場が少ない——それが気になって、同年代向けの通話コミュニティを個人で作っています。名前はClassmate。まだ利用者は少ないですが、少しずつ整えています。",
      purpose: "開発者の人柄と信頼",
      target_audience: "個人開発や新しいサービスに関心がある人",
      expected_action: "フォロー・プロフィール確認",
      cta: "",
      effectHypothesis: "フォロー獲得",
      includeUtm: false,
    },
    {
      dayOffset: 3,
      hourJst: 12,
      minuteJst: 0,
      post_type: "empathy",
      body_text:
        "「元気？」から始まる電話はハードルが高い。でも、画面の向こうで誰かが同じテーマで雑談してるなら、入りやすいかもしれない。",
      purpose: "通話ハードルの言語化",
      target_audience: "電話は苦手だが雑談したい人",
      expected_action: "共感いいね",
      cta: "",
      effectHypothesis: "共感リーチ",
      includeUtm: false,
    },
    {
      dayOffset: 4,
      hourJst: 21,
      minuteJst: 15,
      post_type: "invite",
      body_text:
        "通話相手が少ない初期だからこそ、短時間でも「こんにちは」と言える場が欲しい。Classmateは少人数クラスなので、大人数ラウンジより話しやすいはず。覗くだけでもOK。",
      purpose: "初期の通話体験を促す",
      target_audience: "興味はあるが踏み出せない人",
      expected_action: "サイトを開いてみる",
      cta: "気が向いたらリンクから",
      effectHypothesis: "初回訪問・通話開始",
      includeUtm: true,
    },
    {
      dayOffset: 5,
      hourJst: 19,
      minuteJst: 0,
      post_type: "question",
      body_text:
        "新しい友だち、どうやって作ってる？ 趣味コミュニティ / 仕事のつながり / オンライン / ほぼ作れてない——近いものがあったら教えて。",
      purpose: "会話起点のフォロワー交流",
      target_audience: "友人作りに関心がある人",
      expected_action: "リプライ",
      cta: "",
      effectHypothesis: "リプライ増",
      includeUtm: false,
    },
    {
      dayOffset: 6,
      hourJst: 11,
      minuteJst: 30,
      post_type: "intro",
      body_text:
        "Classmateのホームには「マイクラス」と「ランダム通話」があります。テーマのクラスに入るもよし、気軽に通話へ行くもよし。18歳以上向けです。",
      purpose: "機能の事実紹介（実装済み導線）",
      target_audience: "使い方を知りたい人",
      expected_action: "サイト訪問",
      cta: "詳しくはリンクから",
      effectHypothesis: "理解→訪問",
      includeUtm: true,
    },
    {
      dayOffset: 7,
      hourJst: 20,
      minuteJst: 0,
      post_type: "story",
      body_text:
        "「利用者が少ないと通話が成立しにくい」——作ってみて一番わかる課題です。だからこそ、まずは短時間でも声を出せる空気を大切にしたい。Classmateはまだ初期です。",
      purpose: "課題の正直な共有で信頼",
      target_audience: "立ち上げに共感する人",
      expected_action: "フォロー・応援リプ",
      cta: "",
      effectHypothesis: "応援フォロー",
      includeUtm: false,
    },
    {
      dayOffset: 8,
      hourJst: 12,
      minuteJst: 45,
      post_type: "empathy",
      body_text:
        "チャットは続くのに、声だと急に恥ずかしくなる。その感覚、わかります。だから少人数の方が、最初の一言が出しやすいと思う。",
      purpose: "心理的ハードルへの共感",
      target_audience: "通話が苦手な人",
      expected_action: "いいね",
      cta: "",
      effectHypothesis: "共感リーチ",
      includeUtm: false,
    },
    {
      dayOffset: 9,
      hourJst: 21,
      minuteJst: 0,
      post_type: "invite",
      body_text:
        "もし「週1で短い雑談枠」みたいな企画を試すなら、どの曜日がいい？ まだ開催は確定していません。意見もらえると助かります。",
      purpose: "将来のイベント需要調査（未確定である旨を明示）",
      target_audience: "参加意欲のあるフォロワー",
      expected_action: "曜日をリプライ",
      cta: "",
      effectHypothesis: "需要把握・交流",
      includeUtm: false,
    },
    {
      dayOffset: 10,
      hourJst: 13,
      minuteJst: 15,
      post_type: "question",
      body_text:
        "オンラインで初対面、最初の5分で何話す？ 天気 / 趣味 / 最近ハマってること / 沈黙——リアルなのを教えて。",
      purpose: "雑談の話題づくり＋交流",
      target_audience: "オンライン交流経験者",
      expected_action: "リプライ",
      cta: "",
      effectHypothesis: "リプライ増",
      includeUtm: false,
    },
    {
      dayOffset: 11,
      hourJst: 20,
      minuteJst: 30,
      post_type: "intro",
      body_text:
        "Classmateではクラスに友だちを招待するリンクも使えます。まずは少人数で話す場を、自分たちのペースで。対象は18歳以上です。",
      purpose: "招待機能の事実紹介",
      target_audience: "友人と一緒に始めたい人",
      expected_action: "サイト確認",
      cta: "気になる人はリンクから",
      effectHypothesis: "招待経由の流入仮説",
      includeUtm: true,
    },
    {
      dayOffset: 12,
      hourJst: 12,
      minuteJst: 0,
      post_type: "story",
      body_text:
        "目標は「登録者数」より「一度でも声で話せた人」を増やすこと。Classmateは通話体験まで届いて初めて意味がある、と思って改善しています。",
      purpose: "北星指標の宣言",
      target_audience: "プロダクトの思想に共感する人",
      expected_action: "フォロー",
      cta: "",
      effectHypothesis: "質の高いフォロー",
      includeUtm: false,
    },
    {
      dayOffset: 13,
      hourJst: 21,
      minuteJst: 0,
      post_type: "invite",
      body_text:
        "週末の夜、10分だけ誰かと話せたら十分な日がある。Classmateはそのための音声コミュニティです。無理に長く居なくて大丈夫。",
      purpose: "低ハードルな通話体験への誘導",
      target_audience: "週末に暇・寂しい人",
      expected_action: "訪問・通話開始",
      cta: "気が向いたらリンクへ",
      effectHypothesis: "通話開始",
      includeUtm: true,
    },
  ];

  return plans.map((p, idx) => {
    const utmContent =
      p.utmContent ||
      `cal_${startYmd.replace(/-/g, "")}_d${String(p.dayOffset).padStart(2, "0")}_${idx + 1}`;
    return { ...p, utmContent };
  });
}

export function calendarPlanToInsertRow(params: {
  plan: CalendarPostPlan;
  scheduledAtIso: string;
  campaignId?: string | null;
}) {
  const { plan, scheduledAtIso, campaignId } = params;
  const quality = scoreMarketingDraft(plan);
  const trackingUrl = plan.includeUtm
    ? buildMarketingTrackingUrl({
        channel: "x",
        campaign: "ai_marketing_2w",
        content: plan.utmContent,
      })
    : null;

  return {
    campaign_id: campaignId ?? null,
    channel: "x" as const,
    post_type: plan.post_type as MarketingPostType,
    status: "draft" as const,
    body_text: plan.body_text,
    purpose: `${plan.purpose}｜仮説: ${plan.effectHypothesis}`,
    target_audience: plan.target_audience,
    expected_action: plan.expected_action,
    cta: plan.cta || null,
    utm_campaign: plan.includeUtm ? "ai_marketing_2w" : null,
    utm_content: plan.includeUtm ? plan.utmContent : null,
    tracking_url: trackingUrl,
    scheduled_at: scheduledAtIso,
    generation_source: "manual" as const,
    similarity_score: null,
    quality_score: quality.total,
    quality_notes: quality.notes.join("; ") || null,
    model_name: "calendar14_curated",
    updated_at: new Date().toISOString(),
  };
}

export function jstScheduledIso(params: {
  startYmd: string;
  dayOffset: number;
  hourJst: number;
  minuteJst: number;
}): string {
  const base = new Date(`${params.startYmd}T00:00:00+09:00`);
  const ms =
    base.getTime() +
    params.dayOffset * 24 * 60 * 60 * 1000 +
    params.hourJst * 60 * 60 * 1000 +
    params.minuteJst * 60 * 1000;
  return new Date(ms).toISOString();
}
