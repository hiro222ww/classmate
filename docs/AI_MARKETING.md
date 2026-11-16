# Classmate AI集客自動化 — Phase 1 実装レポート

本番DB適用・本番デプロイ・外部課金開始・SNSアカウント接続は**未実施**（運営者の明示許可が必要）。

---

## 1. 既存環境の調査結果

| 項目 | 結果 |
|---|---|
| Next.js | **16.1.5** / App Router（`app/`）/ React 19 |
| デプロイ | Vercel想定（README記載）。`vercel.json` の Cron は未設定 |
| Supabase | Auth + service-role サーバ API。管理系は RLS ON・公開ポリシーなしで service-role 経由 |
| 管理者認証 | `ADMIN_PASSWORD` HMAC Cookie（`classmate_admin`）。`requireAdmin` |
| Cron | **未導入**。本機能で `/api/admin/marketing/cron` を追加（既定 OFF） |
| OpenAI | **未使用**だった → マーケティング生成のみ追加（キー任意） |
| GA | **未導入** |
| 計測 | `page_visits` + `product_funnel_events`（訪問・登録・通話系イベント）あり |
| UTM | ローンチメモに運用例あり。DB連動の投稿別UTMは本Phaseで生成開始 |
| SNS連携 | **なし** |

プライバシーポリシーは deviceId / アクセスログ / IP（ホスティング）を既に記載。Phase 3 の UTM 集計は個人識別子を新規保存せず、既存訪問・ファネルと突合する方針。

---

## 2. 採用したシステム構成

```
[管理者] → /admin/marketing
         → POST /api/admin/marketing/generate  → OpenAI (or template fallback)
         → CRUD /api/admin/marketing/posts
[任意 Cron] → POST /api/admin/marketing/cron   (MARKETING_CRON_ENABLED=1 のみ)

DB: marketing_campaigns / marketing_posts / marketing_ai_runs
    RLS ON・ポリシーなし → クライアント直書き不可、service-role のみ
```

- 自動公開なし。承認後も手動コピー or 「手動公開済」記録のみ。
- スケジューラは **Vercel Cron** を第一候補（既存インフラ増なし）。許可まで無効。
- Phase 2 は Buffer 優先（単一トークンで X/IG 等）。ネイティブ X/IG/TikTok API はコスト・審査が重い。

---

## 3. 新規作成・変更ファイル

### 新規
- `supabase/migrations/20261116120000_marketing_ai_posts.sql`
- `lib/marketing/*`（types, config, prompts, openai, generate, utm, similarity, adapters）
- `app/api/admin/marketing/{posts,generate,cron}/route.ts`
- `app/admin/marketing/page.tsx`
- `docs/AI_MARKETING.md`
- 対応ユニットテスト `*.test.ts`

### 変更
- `app/admin/page.tsx` — 「AIマーケティング」カード追加

ユーザー向け UI は変更なし。

---

## 4. DBマイグレーション内容

ファイル: `supabase/migrations/20261116120000_marketing_ai_posts.sql`

- `marketing_campaigns` — キャンペーン枠（将来用）
- `marketing_posts` — 投稿案・ステータス・UTM・トークン/コスト・外部投稿ID
- `marketing_ai_runs` — 生成実行ログ（日次上限・予算・エラー）
- RLS ENABLE、公開ポリシーなし
- ステータス: `draft | approved | scheduled | published | rejected | failed`

**本番適用は運営者承認後。** ローカル/ステージングで先に検証すること。

保持目安（運用）: 投稿・実行ログは最低90日。古い `draft/rejected` は定期アーカイブ可（未自動化）。

---

## 5. 実装済み機能（Phase 1）

- 毎朝9:00 JST 向け Cron フック（無効化状態）
- AI 投稿案 3件（共感 / 参加促進 / 紹介）Structured Outputs
- 140字制限・類似度チェック・日次実行回数/予算上限
- APIキー未設定時テンプレート下書き + 管理画面は表示可能
- 管理画面: 一覧・手動生成・編集・承認・却下・予約日時・削除・本文/UTMコピー・手動公開済
- UTM 付きトラッキングURL生成（計測ダッシュボードは Phase 3）
- SNS アダプタ境界（manual のみ）

---

## 6. 未実装機能と理由

| 内容 | 理由 |
|---|---|
| 外部SNS自動投稿 | 課金・審査・トークン接続が必要 → Phase 2 |
| Buffer / X / IG / TikTok 実接続 | 無断契約禁止 |
| 本番 Cron 有効化 | 運営許可待ち |
| 週次AIレポート | Phase 4 |
| 投稿別流入・登録率ダッシュボード | Phase 3（既存 visits/funnel 拡張） |
| `marketing_post_metrics` / `marketing_reports` テーブル | Phase 3–4 で追加 |

---

## 7. 必要な環境変数

| 変数 | 必須 | 説明 |
|---|---|---|
| `ADMIN_PASSWORD` | 既存必須 | 管理画面 |
| `OPENAI_API_KEY` または `OPENAI_MARKETING_API_KEY` | 任意 | 未設定時はテンプレート |
| `OPENAI_MARKETING_MODEL` | 任意 | 既定 `gpt-4o-mini` |
| `MARKETING_DAILY_BUDGET_USD` | 任意 | 既定 `1` |
| `MARKETING_DAILY_RUN_LIMIT` | 任意 | 既定 `20` |
| `MARKETING_CRON_ENABLED` | 任意 | `1` のみ有効 |
| `MARKETING_CRON_SECRET` | Cron有効時必須 | Bearer 照合 |
| Phase 2 予定 | — | `BUFFER_ACCESS_TOKEN` 等 |

APIキーは DB に保存しない。

---

## 8. 外部サービス設定手順（許可後）

### OpenAI
1. OpenAI でキー発行
2. Vercel / ホストに `OPENAI_API_KEY` を登録（このエージェントでは登録しない）
3. `/admin/marketing` で「投稿案を生成」→ OpenAI 経路を確認

### マイグレーション
1. ステージングで `20261116120000_marketing_ai_posts.sql` 適用
2. 管理画面で生成・承認フロー確認
3. 本番適用は別途承認

### Vercel Cron（許可後）
`vercel.json` 例（**まだリポジトリに有効設定は入れていない**）:

```json
{
  "crons": [
    {
      "path": "/api/admin/marketing/cron",
      "schedule": "0 0 * * *"
    }
  ]
}
```

※ Vercel Cron は UTC。JST 09:00 = UTC 00:00。  
加えて `MARKETING_CRON_ENABLED=1` と `MARKETING_CRON_SECRET`、Authorization: Bearer を設定。  
Vercel Cron が Authorization を付けられない場合は、Vercel の保護ヘッダ + アプリ側で `CRON_SECRET` パターンに合わせて改修する。

### Phase 2 SNS（推奨: Buffer）
1. Buffer アカウント + 投稿先チャネル接続
2. Access Token を環境変数へ
3. `lib/marketing/adapters` に Buffer アダプタ実装
4. 承認済み + 予約のみ送信、二重送信防止（`external_post_id` / status published）

---

## 9. 想定月額費用（概算）

| 項目 | 概算 |
|---|---|
| OpenAI gpt-4o-mini（日1回×3投稿 + 手動数回） | **数ドル未満〜$5** |
| Vercel Cron | Hobby/Pro 既存枠内想定 |
| Buffer（Phase 2） | プランによる（無料枠は制限多め） |
| X API 直接 | Basic から月額高。**非推奨（初期）** |
| Instagram / TikTok 公式自動投稿 | ビジネス審査・制約大。Buffer経由が現実的 |

---

## 10. テスト結果

ユニットテスト（vitest）:

- `lib/marketing/similarity.test.ts`
- `lib/marketing/utm.test.ts`
- `lib/marketing/openaiGenerate.test.ts`
- `lib/marketing/config.test.ts`
- `lib/marketing/adapters/index.test.ts`

DB結合・OpenAI実呼び出し・本番 Cron は未実施（キー/本番DBなし）。

---

## 11. 本番運用開始前の確認事項

1. マイグレーション適用の明示承認
2. `OPENAI_API_KEY` 登録の明示承認（課金開始）
3. Cron 有効化の明示承認（`MARKETING_CRON_ENABLED=1`）
4. 投稿は必ず人間承認。無承認の外部公開をしない
5. 架空体験談・誇大表現が出たら却下
6. Phase 3 前にプライバシー表記が UTM/流入分析をカバーするか再確認
7. ユーザー向け画面に変更を入れないこと（本PRは管理側のみ）

---

## Phase 2–4 設計メモ

### Phase 2 SNS比較（要約）

| 手段 | 向き | 注意 |
|---|---|---|
| **Buffer** | 初期最適 | 1接続で複数SNS、予約容易 |
| X API | 直接制御 | 有料・レート・審査 |
| Instagram Graph | ビジネス必須 | 画像/Reels中心、テキスト単体弱い |
| TikTok Content Posting | 審査厳しい | 動画前提 |

アダプタ interface: `lib/marketing/adapters/types.ts`  
二重送信防止: `status=published` または `external_post_id` 済みはスキップ。公開成功と予約登録成功を区別（`scheduledOnly`）。

### Phase 3 計測
- 投稿ごとの `tracking_url` は Phase 1 で付与済み
- `page_visits` / `product_funnel_events` に UTM を関連付け（新規個人識別子は保存しない）
- 計測できない指標は「未計測」（推定値で埋めない）

### Phase 4
- `marketing_ai_runs.run_kind = weekly_report`
- データ少ないときは仮説として提示
- 管理画面にレポート表示
