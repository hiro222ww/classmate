export type UiSuggestion = {
  area:
    | "home_hero"
    | "catchcopy"
    | "buttons"
    | "onboarding"
    | "random_call"
    | "waiting";
  title: string;
  reason: string;
  evidence: string;
  evidenceKind: "code_review" | "measured" | "hypothesis";
  priority: "high" | "medium" | "low";
  validationKpi: string;
  imagePrompt?: string | null;
  compositionNotes?: string | null;
};

/**
 * Code-review based UI/UX suggestions for weekly reports.
 * Not auto-applied to production UI.
 */
export function buildCodeReviewUiSuggestions(): UiSuggestion[] {
  return [
    {
      area: "home_hero",
      title: "ヒーロー写真を「少人数の声の空気」に寄せる",
      reason:
        "現行ヒーローは夕景雰囲気写真（/brand/classmate-home-hero.jpg）。音声コミュニティの体験が伝わりにくい可能性がある。",
      evidence:
        "lib/homeBanners.ts の DEFAULT_HOME_BANNERS。headline「人との出会いで景色が変わる」。",
      evidenceKind: "code_review",
      priority: "high",
      validationKpi: "ホーム→ランダム通話CTAクリック率 / 初回通話開始率",
      imagePrompt:
        "Quiet dusk room, soft window light, two young adults talking on a phone call with calm expressions, no logos, no text overlay, photorealistic, warm natural colors, shallow depth of field, Japanese residential interior, adult 18+, no romance pose",
      compositionNotes:
        "フルブリード横長。人物は端に寄せ、中央〜下に暗いグラデーション余白を残し白文字キャッチを載せる。ロゴ領域と被らない。",
    },
    {
      area: "catchcopy",
      title: "キャッチを「同年代×気軽に通話」へ具体化",
      reason:
        "現キャッチは情緒的だがClassmate固有の音声・少人数が弱い。SEO文案の方が製品説明に近い。",
      evidence: "homeBanners headline vs lib/seo.ts HOME_INTRO / HOME_DESCRIPTION",
      evidenceKind: "code_review",
      priority: "high",
      validationKpi: "ヒーロー直下CTAクリック率、オンボーディング到達率",
      imagePrompt: null,
      compositionNotes: null,
    },
    {
      area: "buttons",
      title: "ランダム通話の通話/チャット二択の優先度を検証",
      reason:
        "RandomTalkCtaは通話とチャットが並ぶ。初期は通話体験を優先した方が北星KPIに近い可能性。",
      evidence: "components/home/RandomTalkCta.tsx（通話・チャット）",
      evidenceKind: "hypothesis",
      priority: "medium",
      validationKpi: "通話CTA vs チャットCTAのクリック比、call_started",
      imagePrompt: null,
      compositionNotes: null,
    },
    {
      area: "onboarding",
      title: "最小プロフィール後の「次に何をするか」を明示",
      reason:
        "登録完了後にホームへ戻るだけだと、初回通話までの意図が弱い可能性がある。",
      evidence: "onboarding → home redirect / min_profile_saved funnel",
      evidenceKind: "hypothesis",
      priority: "high",
      validationKpi: "min_profile_saved → talk_cta_clicked / call_started 転換",
      imagePrompt: null,
      compositionNotes: null,
    },
    {
      area: "random_call",
      title: "空の時間帯でも「短時間でOK」をUI上で伝える",
      reason:
        "利用者が少ない初期は通話成立不安が離脱要因になりやすい。コピーでハードルを下げる余地。",
      evidence: "募集/待機UI（callRecruitmentUi）とマーケ戦略の初期課題",
      evidenceKind: "hypothesis",
      priority: "medium",
      validationKpi: "lobby_joined → call_started、待機離脱率（計測可能なら）",
      imagePrompt: null,
      compositionNotes: null,
    },
    {
      area: "waiting",
      title: "ひとり待機中の招待導線を目立たせる",
      reason:
        "実装上、待機中に友達招待が可能。初期は招待で少人数を先に成立させるのが有効。",
      evidence: "callRecruitmentUi「友達を招待できます」/ 招待リンク実装",
      evidenceKind: "code_review",
      priority: "medium",
      validationKpi: "招待リンク生成数、招待経由参加（計測できれば）",
      imagePrompt: null,
      compositionNotes: null,
    },
  ];
}
