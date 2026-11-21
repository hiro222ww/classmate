# 承認して今すぐ投稿（Buffer shareNow）

## 操作
1. Discord レビューリンク or `/admin/marketing?post=<id>` を開く
2. 本文・送信先（Buffer→X @classmate0401）・UTM URL を確認
3. **承認して今すぐ投稿** を押す（確認ダイアログあり）
4. 結果: `x_published` / `buffer_accepted` / `failed` / `unknown`

## 即時公開の実現方法
Buffer GraphQL `createPost` の **`mode: shareNow`**（予約キューではない）。

## ゲート（再デプロイ不要）
| 層 | 内容 |
|---|---|
| 必須 | 管理者ログイン + 明示クリック（1投稿） |
| DB | `app_settings.marketing_immediate_publish_enabled`（管理画面でON/OFF） |
| 緊急停止 | `MARKETING_BUFFER_PUBLISH_FORCE_OFF=1`（env） |
| 旧「Bufferへ予約」 | 従来どおり `MARKETING_BUFFER_PUBLISH_ENABLED=1` が必要 |

Cron / AI は `publish-now` を呼びません。

## 二重投稿防止
- DB claim（`publish_claim_token` + TTL）
- `external_post_id` 済みは拒否
- `unknown` は自動再送しない

## 本番SNS実投稿
別途承認が必要。Preview では `dryRun: true` で疑似送信可。
