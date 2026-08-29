# ランダム通話ローンチメモ

最短で「3人集まると通話」を試してもらうための投稿・計測メモ。

## 投稿案（短文）

- 「知らない人3人で、15秒だけ話してみない？」
- 「テーマなし・登録最小。集まればすぐ通話。」
- 「初回開催：今夜だけ無料で入れます。」

## 15秒で伝えること

1. 何ができるか：初対面3人のボイス通話
2. どう始まるか：名前と年齢だけで待機 → 3人で自動開始
3. 何が起きないか：長い登録・テーマ選びは不要（任意）

## 初回開催の進め方

- 開催枠を1つ決めて告知（例：今夜 21:00〜）
- 待機は最大5分＋1回延長。集まらなければ「今回はやめる」で退出可
- うまくいったら「またやる？」投票 → 正式クラス化（フェーズ2）

## UTM 例

投稿ごとに `utm_source` / `utm_medium` / `utm_campaign` を分ける。

| 媒体 | 例 |
|------|-----|
| X | `?utm_source=x&utm_medium=social&utm_campaign=random_call_launch` |
| Discord | `?utm_source=discord&utm_medium=community&utm_campaign=random_call_launch` |
| 友人DM | `?utm_source=dm&utm_medium=referral&utm_campaign=random_call_launch` |

管理画面のアクセス履歴・ファネルイベントで CTA クリック〜待機〜通話開始を追う。
