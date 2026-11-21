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
| 投稿別流入・登録率ダッシュボード | Phase 3 実装済 |
| 週次AIレポート / 改善方針フィードバック | Phase 4 実装済（Cron・適用は既定OFF） |

---

## 7. 必要な環境変数

| 変数 | 必須 | 説明 |
|---|---|---|
| `ADMIN_PASSWORD` | 既存必須 | 管理画面 |
| `OPENAI_API_KEY` または `OPENAI_MARKETING_API_KEY` | 任意 | 未設定時はテンプレート |
| `OPENAI_MARKETING_MODEL` | 任意 | 既定 `gpt-4o-mini` |
| `MARKETING_DAILY_BUDGET_USD` | 任意 | 既定 `1` |
| `MARKETING_DAILY_RUN_LIMIT` | 任意 | 既定 `20` |
| `MARKETING_CRON_ENABLED` | 任意 | `1` のみ有効（日次投稿生成） |
| `MARKETING_WEEKLY_CRON_ENABLED` | 任意 | `1` のみ有効（週次分析）。**既定OFF** |
| `MARKETING_WEEKLY_BUDGET_USD` | 任意 | 週次分析の概算上限（既定 `2`） |
| `MARKETING_WEEKLY_RUN_LIMIT` | 任意 | 直近7日の weekly_report 回数上限（既定 `5`） |
| `MARKETING_CRON_SECRET` | Cron有効時必須 | Bearer 照合（日次・週次共通） |
| `BUFFER_ACCESS_TOKEN` または `BUFFER_API_KEY` | Phase2任意 | Buffer GraphQL Bearer |
| `BUFFER_CHANNEL_ID` | Phase2任意 | 投稿先チャネルID |
| `MARKETING_BUFFER_PUBLISH_ENABLED` | Phase2任意 | `1` のときのみ実送信 |

APIキーは DB に保存しない。

---

## 8. 外部サービス設定手順（許可後）

### OpenAI
1. OpenAI でキー発行
2. Vercel / ホストに `OPENAI_API_KEY` または `OPENAI_MARKETING_API_KEY` を登録（このエージェントでは登録しない）
3. `/admin/marketing` で「投稿案を生成」→ OpenAI 経路を確認

SNS運用開始前の詳細チェックリスト・試験投稿手順・通知設計:
→ `docs/AI_MARKETING_SNS_OPS_PREP.md` / `docs/env.marketing.openai.example`

14日間の初期運用実験プラン（ペース・切り口・計測・週次反映・評価）:
→ `docs/AI_MARKETING_14DAY_OPS.md`

### マイグレーション
1. ステージングで `20261116120000_marketing_ai_posts.sql` 適用
2. 管理画面で生成・承認フロー確認
3. 本番適用は別途承認

### Vercel Cron（許可後）
リポジトリ直下の `vercel.json` に Cron を定義（実実行は env ゲートが `1` のときのみ）:
- 日次: JST 09:00 ≈ UTC 00:00 → `0 0 * * *` → `/api/admin/marketing/cron`
- 週次: **日曜 20:00 JST** = UTC 11:00 → `0 11 * * 0`（`MARKETING_WEEKLY_CRON_EXPR_SUNDAY_20_JST`）→ `/api/admin/marketing/cron/weekly`

※ Vercel Cron は UTC。  
必須 env: `MARKETING_CRON_ENABLED=1` / `MARKETING_WEEKLY_CRON_ENABLED=1`（それぞれ明示）と `MARKETING_CRON_SECRET`（または Vercel `CRON_SECRET`）。  
Vercel は `CRON_SECRET` を設定すると `Authorization: Bearer <CRON_SECRET>` を付与する。アプリは両方を受理する。  
`proxy.ts` は一致する Bearer（または `?secret=`）があるときだけ管理 Cookie なしで Cron 経路を通す。ルート側で再度ゲート+秘密を検証する。

### Buffer 接続手順（ローカル）

設定場所:
- **ローカル開発**: リポジトリ直下の `.env.local`（`.gitignore` で除外済み。コミットしない）
- **本番（許可後）**: Vercel → Project → Settings → Environment Variables
- コード参照: `lib/marketing/bufferConfig.ts`（`BUFFER_ACCESS_TOKEN` / `BUFFER_CHANNEL_ID` / `MARKETING_BUFFER_PUBLISH_ENABLED`）

記述例: `docs/env.marketing.buffer.example` を `.env.local` にコピーして値を埋める。

```bash
# .env.local
BUFFER_ACCESS_TOKEN=your_buffer_api_key
BUFFER_CHANNEL_ID=             # 接続確認後に classmate0401 の id を入れる
MARKETING_BUFFER_PUBLISH_ENABLED=0
```

接続確認（投稿なし）:
1. `.env.local` に `BUFFER_ACCESS_TOKEN` を入れ、`npm run dev` を再起動
2. 管理ログイン後 `/admin/marketing` →「Buffer接続確認」
3. または `node scripts/probe-buffer-connection.mjs`（トークンは表示しない）
4. `classmate0401` の `BUFFER_CHANNEL_ID` を `.env.local` に追記して再起動
5. **`MARKETING_BUFFER_PUBLISH_ENABLED=0` のまま**（実予約・投稿はまだしない）

API:
- `GET /api/admin/marketing/buffer` — 設定状態のみ
- `GET /api/admin/marketing/buffer?probe=1&match=classmate0401` — GraphQLでチャンネル一覧（要管理者Cookie）

予約投稿との互換:
- 既存 `bufferPublishAdapter` は Buffer GraphQL `createPost`（`customScheduled` / `addToQueue`）を使用
- 送信は `MARKETING_BUFFER_PUBLISH_ENABLED=1` のときのみ。ゲートOFF時は `buffer_publish_disabled` を返しネットワーク投稿しない

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
- `lib/marketing/strategy.test.ts` / `uiSuggestions.test.ts` / `analysisMetrics.test.ts` / `prompts.strategy.test.ts`

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

## Phase 2/3 実装（追加）

### プライバシー（実装方針）
- 保存するのは **UTMキャンペーンパラメータのみ**（個人情報ではない）
- 新規 Cookie / IP / 指紋は追加しない。既存 `device_id` と sessionStorage（タブ内 first-touch）のみ
- 本番公開前にプライバシーポリシーへ追記推奨:
  - 取得情報: 「広告・キャンペーン経由の流入パラメータ（UTM等）」
  - 利用目的: 「マーケティング効果測定・改善」

### 実装内容
- Buffer GraphQL アダプタ（`MARKETING_BUFFER_PUBLISH_ENABLED=1` までネットワーク送信しない）
- `POST /api/admin/marketing/publish`（二重送信防止・予約/公開の区別・リトライ可能エラー）
- `page_visits` に UTM 列追加（マイグレーション未適用時は既存 insert にフォールバック）
- ファネルイベント meta に UTM を自動付与
- `GET /api/admin/marketing/metrics` + `/admin/marketing` ダッシュボード
- 通話成立は専用イベント未定義のため **未計測**（`call_started` のみ実測）

### 追加マイグレーション
`supabase/migrations/20261116140000_marketing_phase23.sql`

### Phase 4（実装済・運用は承認後）

目的: 実績集計 → 週次レポート → 改善方針バージョン → 次回の投稿生成プロンプトへ反映（公開は承認制のまま）。

#### マイグレーション
`supabase/migrations/20261117120000_marketing_phase4_reports.sql`
- `marketing_reports`（週次/手動レポート履歴）
- `marketing_strategy_versions`（改善方針バージョン。同時 active は1件）

#### API
- `GET/POST /api/admin/marketing/reports` — 履歴・詳細 / 手動分析
- `GET/POST /api/admin/marketing/strategies` — 一覧・適用・無効化
- `POST /api/admin/marketing/cron/weekly` — 週次Cron（`MARKETING_WEEKLY_CRON_ENABLED=1` + secret）

#### 挙動
- 直近7日・28日の UTM訪問/登録/通話開始・投稿タイプ別・時間帯別を集計（Xいいね等は未配線のため未使用）
- OpenAI失敗時はヒューリスティック分析にフォールバック。**投稿生成は従来どおり継続**
- 分析で作る方針は既定 **draft**（自動適用しない）。管理画面で activate / deactivate / 過去版へロールバック
- UI・ヒーロー改善案はレポートに含めるのみ（**画面の自動変更なし**）
- Buffer自動公開・日次/週次Cronは既定OFF

#### 管理画面 `/admin/marketing`
- 週次レポート表示・UI改善案・改善方針の適用/無効化・履歴・手動分析・次回投稿への反映状況

#### 運用開始手順（承認後）
1. ステージングで Phase4 マイグレーション適用
2. 管理画面で「手動で週次分析」→レポート確認
3. 改善方針を適用して投稿案生成 → 文面のみ変化することを確認（SNS未公開）
4. 問題なければ本番マイグレーション（別途明示承認）
5. 週次Cronを有効化するなら `MARKETING_WEEKLY_CRON_ENABLED=1` + secret（別途明示承認）
6. Buffer公開・日次Cronは従来どおり別ゲート

### Phase 4.1（改善提案・運営者通知・実装済 / 有効化は承認後）

目的: 週次分析から UI/UX・登録・通話導線の改善提案を作り、運営者へ通知。提案の採用/保留/却下は管理画面。

#### 調査結果（通知方式）
- 既存 Web Push は `class_memberships` の device 向けのみ。管理者 Cookie ユーザーを狙えない。
- そのため運営者通知は **メール（Resend）** を採用。`MARKETING_ADMIN_NOTIFY_ENABLED=1` + `MARKETING_ADMIN_NOTIFY_EMAIL` + `RESEND_API_KEY` / `EMAIL_FROM` が必要。
- 同一 fingerprint の再送は `marketing_admin_notification_log` で抑止。高優先提案は `urgent_proposal` として週次ダイジェストと別に通知可。

#### マイグレーション
`supabase/migrations/20261117180000_marketing_improvement_proposals.sql`
- `marketing_improvement_proposals`（pending/accepted/held/rejected、open fingerprint 一意）
- `marketing_admin_notification_log`（送信・重複スキップ・無効の監査）

#### 挙動
- 週次Cron想定時刻: **日曜 20:00 JST**（UTC 11:00、`0 11 * * 0`）。有効化は `MARKETING_WEEKLY_CRON_ENABLED=1` が必要（既定OFF）
- Cron実行時: SNS**投稿方針**は自動適用可。SNS公開・UI/画像変更はしない
- 手動「週次分析」: 方針は draft のまま（`activateStrategy: false`）
- `/admin/marketing` で提案の採用・保留・却下
- 通知・Cron・有料API・本番DB適用はいずれも事前承認が必要

### AI運営憲章（独立PR・本番未適用）

詳細: `docs/AI_OPERATING_CHARTER.md`

- マイグレーション `20261117210000_ai_operating_charter.sql`（Phase 1〜4 本番反映とは分離）
- 投稿生成・週次分析・改善提案が承認済み方針を参照し、矛盾は要確認
- 管理: `/admin/marketing/charter`
