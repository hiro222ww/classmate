# AI運営憲章（方針データベース）

Phase 1〜4 の本番反映を妨げない独立機能。本番DB適用・デプロイは**運営者承認後**。

## 目的
Classmate の AI が、運営者の理念・禁止事項・SNS/UI方針に沿って PDCA を回せるようにする。

## 調査結果（既存）
- `marketing_strategy_versions` は週次の**投稿方針**のみ（憲章の永続理念ではない）
- 方針カテゴリ横断の専用テーブルは未存在だった → 本マイグレーションで追加

## スキーマ（最小）
マイグレーション: `supabase/migrations/20261117210000_ai_operating_charter.sql`

| テーブル | 役割 |
|---|---|
| `ai_operating_policies` | 方針本体（カテゴリ・重要度・status・priority_tier・version） |
| `ai_operating_policy_revisions` | 追加/編集/無効化/再有効化/復元の履歴 |
| `ai_operating_policy_memos` | 自由入力メモ（未信頼入力・分類・承認） |

既存テーブルへの列追加:
- `marketing_posts.charter_policy_ids` / `charter_compliance`
- `marketing_reports.charter_snapshot`
- `marketing_improvement_proposals.charter_alignment` / `charter_policy_ids`

RLS ON・公開ポリシーなし（service-role / 管理者APIのみ）。

## カテゴリ
理念 / 想定ユーザー / ブランド世界観 / SNS / UI・UX / ホーム画像 / KPI / 禁止事項 / アイデア

## 優先順位
1. 法令・安全性・個人情報保護  
2. 承認済み基本理念・禁止事項  
3. 承認済み個別方針  
4. ユーザーFB・実測  
5. AI仮説  

データ改善でも重要理念に反する変更は自動実行しない。

## 自由入力メモ
- `/admin/marketing/charter` で自然文入力
- サニタイズ（秘密情報ブロック・プロンプトインジェクション中和）
- 分類・重複・矛盾検出（ヒューリスティック、有料APIなし既定）
- 重要方針と矛盾 → `needs_approval`（自動上書きしない）
- 単なるアイデア → `idea_unadopted`（正式方針と区別）

## AIへの反映
以下は有効方針を読み込み、生成後に整合性チェックする。
- SNS投稿生成（`generatePosts`）
- 週次分析（`weeklyReport`）
- 改善提案（UI/UX・ホーム画像含む → `alignProposalsWithCharter`）
- ユーザーFB由来提案（週次に同梱）

矛盾 → `needs_review` / 要確認。自動適用しない。

## API
- `GET/POST /api/admin/marketing/charter`（`requireAdmin`）
  - memo / create / update / set_status / approve_memo / restore

## セキュリティ
- 管理者のみ
- メモは未信頼入力
- 秘密情報を方針DBに保存しない
- 個人情報をAIへ無断送信しない（週次は匿名集計のみ）
- 本番DB・デプロイ・有料API・Cron有効化は無断実行しない

## 有効化（承認後）
1. Phase 1〜4 が安定稼働していることを確認
2. `20261117210000_ai_operating_charter.sql` を適用
3. `/admin/marketing/charter` で方針を投入
4. 投稿生成・週次分析で憲章参照を確認（SNS公開は従来どおり承認制）
