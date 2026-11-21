# AIマーケティング本番移行 — リリース準備メモ

作成: 2026-11-20（Asia/Tokyo）。**マージ・デプロイ・Cron/通知/Buffer公開・実投稿は未実施。**

## 1. 週次Cronの意図（コード基準）

- 正: `MARKETING_WEEKLY_CRON_EXPR_SUNDAY_20_JST = "0 11 * * 0"`（**日曜 20:00 JST** = UTC 11:00）
- `docs/AI_MARKETING.md` の vercel.json 例をコードに合わせて修正済み
- `vercel.json` に日次/週次 Cron 定義を追加済み。実実行は `MARKETING_CRON_ENABLED` / `MARKETING_WEEKLY_CRON_ENABLED` が `1` のときのみ

## 2. 本番DB検証（読み取りのみ）

接続: Cursor Secret `SUPABASE_DB_URL`（Session pooler）。パスワードが `[…]` で囲まれていると URL パース/認証に失敗するため、接続時のみ括弧を除去して検証。

| 対象 | 結果 |
|---|---|
| Phase1〜4 テーブル | `marketing_posts/campaigns/ai_runs/reports/strategy_versions` 存在 |
| RLS | 上記すべて ON、公開ポリシー 0 |
| 行数 | marketing_* = 0 / page_visits=1289 / product_funnel_events=108 |
| quality/UTM列 | `quality_score`,`expected_action`,`utm_*`,`external_post_id` あり |
| #70 proposals | **未作成** |
| #71 user_feedback | **未作成** |
| #72 charter | **未作成** |

## 3. バックアップ

| 項目 | 値 |
|---|---|
| 新規 | `backups/supabase/prod_20261120T024931Z`（Phase1〜4適用後） |
| 旧バックアップ | `prod_20261117T*` は未削除・未上書き |
| 復元テスト | local PG17 `classmate_restore_test_20261120` — **PASS**（件数一致） |
| Artifact | `/opt/cursor/artifacts/classmate_prod_db_backup_20261120T024931Z.tar.gz` |

## 4. Vercel Production 環境変数棚卸し（値は出さない）

`vercel env ls production` による**名前の有無**:

### ある（Production）
- 既存: `ADMIN_PASSWORD`, `NEXT_PUBLIC_ADMIN_PASSWORD`, Supabase系, Stripe, TURN, VAPID, `NEXT_PUBLIC_APP_ORIGIN/URL`
- マーケ追加（3d ago）: `BUFFER_ACCESS_TOKEN`, `BUFFER_CHANNEL_ID`, `MARKETING_BUFFER_PUBLISH_ENABLED`

### ない（本番稼働前に要判断）
- `OPENAI_API_KEY` / `OPENAI_MARKETING_*`（無くてもテンプレ生成可）
- `MARKETING_CRON_ENABLED`, `MARKETING_WEEKLY_CRON_ENABLED`, `MARKETING_CRON_SECRET`
- `MARKETING_ADMIN_NOTIFY_ENABLED`, `MARKETING_ADMIN_NOTIFY_EMAIL`
- `RESEND_API_KEY`, `EMAIL_FROM`

### 注意
- Sensitive 変数の実値は CLI pull で空になることがあり、本メモでは**有無のみ**を断定
- `NEXT_PUBLIC_ADMIN_PASSWORD` は命名上クライアント露出リスク。本番前に必要性を再確認推奨
- Buffer 系は Production のみ（Preview には未設定の可能性）

## 5. PRスタックレビュー要約（#65→#72）

順序: main ← #65 ← #66 ← #68 ← #69 ← #70 ← #71 ← #72（すべて open）

| 観点 | 評価 |
|---|---|
| セキュリティ | 管理APIは `requireAdmin`。マーケ/提案/憲章は RLS ON・公開ポリシーなし。Buffer/Cron/Notify 既定OFF。FB原文は週次AIに送らない |
| 既存機能影響 | ユーザー向けは `/feedback` と設定導線程度。ホームUI自動変更なし |
| マイグレ順序 | 本番は 120000〜17120000 まで適用済。17180000→17200000→17210000 はコードマージ後・承認後 |
| リスク | スキーマ先行（テーブルあり・コード未デプロイ）は現状未使用で許容。マージは下から順に |

## 6. Preview

- PR #72 Preview（Vercel Ready）で `/admin/marketing`, `/feedback`, `/admin/marketing/charter` のルート確認用
- Preview には Buffer/OpenAI が無い可能性 → テンプレ生成・UI確認が主
- 本番デプロイ前の操作確認チェックリストは管理画面ログイン後に実施

## 禁止事項（継続）

本番DB変更 / 残マイグレ適用 / PRマージ / 本番デプロイ / Cron・通知・Buffer公開ON / SNS実投稿 — **未実施**
