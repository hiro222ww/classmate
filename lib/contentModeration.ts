import { getEffectiveAgeMode } from "@/lib/agePolicy";

export type ContentModerationHit = {
  code: string;
  label: string;
};

const CONTACT_PATTERNS: Array<{ code: string; label: string; re: RegExp }> = [
  { code: "line", label: "LINE", re: /\bline\b|line\.me|ライン/i },
  { code: "instagram", label: "Instagram", re: /instagram|インスタ/i },
  { code: "twitter", label: "X / Twitter", re: /twitter|x\.com|ツイッター/i },
  { code: "discord", label: "Discord", re: /discord/i },
  {
    code: "phone",
    label: "電話番号",
    re: /\b0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}\b/,
  },
  {
    code: "email",
    label: "メールアドレス",
    re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
  },
  { code: "url", label: "URL", re: /https?:\/\/|www\./i },
  { code: "address", label: "住所", re: /(住所|番地|マンション|アパート)/ },
  { code: "station_meet", label: "駅集合", re: /(駅集合|駅で会|駅前)/ },
  { code: "meetup", label: "会おう", re: /(会おう|会わない|会える)/ },
  { code: "meetup_time", label: "待ち合わせ", re: /(待ち合わせ|待合)/ },
];

export function scanContactRisk(text: string): ContentModerationHit[] {
  const value = String(text ?? "").trim();
  if (!value) return [];

  const hits: ContentModerationHit[] = [];
  for (const pattern of CONTACT_PATTERNS) {
    if (pattern.re.test(value)) {
      hits.push({ code: pattern.code, label: pattern.label });
    }
  }
  return hits;
}

export function contactRiskWarningMessage(hits: ContentModerationHit[]): string {
  const labels = [...new Set(hits.map((h) => h.label))];
  return (
    "連絡先交換や待ち合わせの誘導に見える内容が含まれています（" +
    labels.join("、") +
    "）。Classmateでは出会い目的・連絡先交換・対面待ち合わせは禁止されています。"
  );
}

export type ContentModerationDecision =
  | { ok: true }
  | { ok: false; block: boolean; message: string; hits: ContentModerationHit[] };

export async function moderateUserText(
  text: string
): Promise<ContentModerationDecision> {
  const hits = scanContactRisk(text);
  if (hits.length === 0) return { ok: true };

  const message = contactRiskWarningMessage(hits);
  const mode = await getEffectiveAgeMode();
  const block =
    mode === "minor_separated_test" || mode === "open_16_plus";

  return { ok: false, block, message, hits };
}
