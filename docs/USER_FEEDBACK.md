# ユーザーフィードバック（製品改善）

## 調査結果（既存）
- **ユーザー間通報** `user_reports` + `/admin/reports`（迷惑行為等）— 製品フィードバックとは別
- **お問い合わせ**は mailto のみ（フォームなし）
- 製品フィードバック用テーブルは未存在だった

## 本実装（最小）
- 送信: `/feedback` + `POST /api/feedback`
- 保存: `user_feedback` / `user_feedback_clusters`（マイグレーション未適用・要承認）
- 分類: マスキング後ヒューリスティック（有料APIなし既定）
- クラスタ: fingerprint + 単語重複、同一端末は `unique_voice_key` で1票
- 週次: Phase4 `weeklyReport` に匿名集計を追記し、改善提案へ反映
- 重大/安全: 運営者メール（`MARKETING_ADMIN_NOTIFY_ENABLED` 流用、既定OFF）
- 管理: `/admin/feedback` で採用・保留・対応済み・却下（安全却下はメモ必須）

## プライバシー
- `body_raw` は管理者のみ。外部AI・週次集計は `body_redacted` / 匿名集計のみ
- ポリシー: 対応後おおむね1年（`app/privacy/page.tsx`）
- 安全関連は AI 単独却下禁止

## 有効化（承認後）
1. `20261117200000_user_feedback.sql` を適用
2. （任意）通知: `MARKETING_ADMIN_NOTIFY_ENABLED=1` + メール設定
3. デプロイ / PR マージは別途承認
