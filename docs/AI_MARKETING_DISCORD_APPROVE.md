# Discord 内承認ボタン（将来実装メモ）

現行の運用ダイジェストは **Incoming Webhook（一方向テキスト）** のみ。  
Webhook ではボタン付き Interaction を送れないため、Discord 内ワンタップ承認は別構成が必要。

## 現状（この PR 時点）

| 項目 | 内容 |
|---|---|
| 通知 | 毎日 19:00 JST Cron → Discord テキスト（候補ごとの管理画面 deep link） |
| レビュー | スマホでリンク → `/admin/login?next=/admin/marketing?post=<id>` → 承認/却下 |
| 公開 | **別操作**（`Bufferへ予約` / 手動公開）。承認だけでは SNS に出ない |

## Discord 内ボタンを足す場合の構成案

1. **Discord Application** を作成（Bot + Interactions）
2. **Interactions Endpoint**（例: `POST /api/admin/marketing/discord/interactions`）
   - Discord が送る署名を **Ed25519** で検証（`X-Signature-Ed25519` + `X-Signature-Timestamp` + raw body）
   - `DISCORD_PUBLIC_KEY` を Vercel に登録
3. 通知送信を Webhook から **Bot `channel.messages.create`（components: buttons）** に変更  
   - または Webhook 通知のあと Bot が同一チャンネルへボタン付きフォローアップを投稿
4. ボタン `custom_id` 例: `mkt_approve:<postId>` / `mkt_reject:<postId>`（短く・推測困難な nonce 付き推奨）
5. Interaction ハンドラで status のみ更新（`approved` / `rejected`）。**Buffer publish は絶対に呼ばない**
6. 応答は ephemeral で「承認しました（SNS未公開）。公開は管理画面で」と明示

## 必要な認証・認可

| 層 | 方式 | 目的 |
|---|---|---|
| Discord → App | Ed25519 署名検証 | 偽 Interaction を拒否 |
| 操作者 | Discord User ID の allowlist（env: `MARKETING_DISCORD_OPERATOR_IDS`） | チャンネル閲覧者全員が承認できないようにする |
| Classmate 側 | 既存 `ADMIN_PASSWORD` cookie とは別系統 | Bot 経路は Discord ID で運営者を識別 |
| SNS 公開 | 引き続き `MARKETING_BUFFER_PUBLISH_ENABLED` + 管理画面明示操作 | 誤投稿防止 |

**やらないこと**

- 署名なしの「秘密URLワンクリック承認」（漏洩＝誰でも承認）
- Discord ボタンからの Buffer 即公開
- ユーザーフィードバック原文を Discord に載せる

## 段階導入のすすめ

1. （済）deep link + 管理画面で承認/却下（本 PR）
2. Bot + Interaction で承認/却下のみ（公開は管理画面）
3. （任意）公開は「管理画面の二段階確認」のまま維持。Discord から公開するなら別ボタン＋別 allowlist＋本番ゲート必須
