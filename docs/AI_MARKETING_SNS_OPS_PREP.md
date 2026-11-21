# AI Marketing — SNS運用開始前チェック（Post-Cron）

前提: PR #75 により日次/週次 Cron は本番稼働済み。  
本ドキュメントは **有料API承認前・実SNS投稿前** の整理と手順。

安全ゲート（現状維持）:
- `MARKETING_BUFFER_PUBLISH_ENABLED=0`
- SNS実投稿なし
- 有料 OpenAI の本番投入は **別途承認後**
- Cron フラグは変更しない（既に `1`）

---

## 1. OpenAI 利用設計

| 項目 | 既定 / 推奨 | 備考 |
|---|---|---|
| モデル | `gpt-4o-mini`（`OPENAI_MARKETING_MODEL`） | コスト優先。品質不足時のみ上位モデル検討 |
| キー | `OPENAI_MARKETING_API_KEY` 優先、なければ `OPENAI_API_KEY` | DB保存しない。ログに出さない |
| 日次予算 | `MARKETING_DAILY_BUDGET_USD=1` | 超過で生成停止（ソフト上限） |
| 日次実行 | `MARKETING_DAILY_RUN_LIMIT=20` | Cron成功は1日1回に別途dedup |
| 週次予算 | `MARKETING_WEEKLY_BUDGET_USD=2` | weekly_report 用 |
| 週次実行 | `MARKETING_WEEKLY_RUN_LIMIT=5` / 直近7日 | |
| 月額目安 | 数ドル〜$5 程度 | 日1回×3案 + 週1分析 + 手動数回想定 |

### 障害時 fallback

1. キー未設定 / API失敗 / パース失敗 → `template_fallback`（費用 $0）
2. 週次分析失敗 → `heuristic_fallback`（費用 $0）
3. Cron 日次は JST 日で成功済みならスキップ（`daily_generate_already_succeeded_today`）
4. 品質が低い OpenAI 案は、残予算があれば **1回だけ** 再生成

キーが無い現状はすべて template/heuristic。本番でキーを入れるまで有料課金は発生しない。

---

## 2. 本番 OpenAI 設定の安全手順（承認後）

1. OpenAI で **マーケ専用キー** を発行（プロジェクト権限は最小）
2. Vercel → Project `classmate` → Settings → Environment Variables
3. Production（必要なら Preview）に追加:
   - `OPENAI_MARKETING_API_KEY`（Secret、**末尾改行なし**）
   - 任意: `OPENAI_MARKETING_MODEL=gpt-4o-mini`
   - 任意: 予算系（既定で可）
4. **Redeploy Production**（env 反映に必要）
5. `/admin/marketing` で「投稿案を生成」→ `generation_source=openai` を確認
6. 失敗時は自動で template に落ちることを1回確認

禁止:
- キーを PR / Issue / チャット / スクリーンショットに載せる
- `vercel env` の値をログに echo する
- 承認前に Production へキーを入れる

例ファイル: `docs/env.marketing.openai.example`

---

## 3. 現行生成物の評価（2026-11-21 時点）

### 投稿案（6件・すべて `template_fallback`）

強み:
- UTM 形式は統一済み: `utm_source=x&utm_medium=social&utm_campaign=ai_marketing&utm_content=post_YYYYMMDD_N`
- 憲章チェック済み draft は `charter_compliance=ok`
- 宣伝色の強い断定は抑えめ

問題点（テンプレ運用）:
- 同一文面の日次再利用 → 類似度が高く、旧ロジックが `（別角度）` を連打していた
- OpenAI 未設定のためバリエーション不足（獲得実験に弱い）
- スモーク痕跡: `#edited` 付き scheduled 文面あり → 試験投稿候補から除外
- draft 3件のうち question/intro は類似ノート付き

改善（本PRで実施）:
- タイプごとに複数テンプレ本文を用意し、最近投稿と被りにくい案を選択
- `（別角度）` 連打をやめ、必要なときのみ日付キューを1回付与

### 改善提案（8件・pending）

| 優先 | 内容 | 扱い |
|---|---|---|
| high | ヒーロー画像を「声の空気」へ | UI変更は承認必須。今は保留可 |
| high | キャッチを「同年代×気軽に通話」へ | コピー実験候補 |
| high | 登録後の次アクション明示 | オンボーディング改善候補 |
| medium | フィードバック「ホーム導線がわかりにくい」 | テスト送信由来。本番FB増加まで参考 |
| medium | UTMサンプル不足 | **実投稿開始で解消する計測課題** |
| medium | 待機中招待・短時間OK・通話/チャット優先 | 仮説。計測後に判断 |

憲章: 全件 `aligned`（矛盾による `needs_review` なし）。

---

## 4. Buffer / X / UTM 検証結果

検証方法: ローカル `.env.local` のトークンで Buffer GraphQL を **読み取りのみ** 実行（投稿なし）。

| 項目 | 結果 |
|---|---|
| `BUFFER_ACCESS_TOKEN` | 設定あり |
| `BUFFER_CHANNEL_ID` | 設定あり・一覧に存在 |
| 投稿先 | `service=twitter` / `classmate0401` |
| disconnected / locked | false / false |
| `MARKETING_BUFFER_PUBLISH_ENABLED` | `0` |
| 本番 Vercel | 上記3変数が Production に存在（値は Hidden） |

UTM:
- 生成URLは `https://classmate-room.com/?utm_source=x&utm_medium=social&utm_campaign=ai_marketing&utm_content=...`
- 訪問計測は Phase3 の `page_visits` UTM 列に依存（サンプル不足は投稿未実施のため想定内）

接続確認コマンド（投稿なし）:
```bash
node scripts/probe-buffer-connection.mjs
# または管理画面 /admin/marketing → Buffer接続確認
```

---

## 5. 1件試験投稿の安全手順（**まだ実行しない**）

ゴール: 人間承認つきで X（classmate0401）へ **1件だけ** 出し、UTM流入を確認する。

### A. 準備（投稿ゲートOFFのまま）

1. `/admin/marketing` で候補を選ぶ  
   - 推奨: 新規 OpenAI 生成案、または `invite` 系の自然な draft  
   - 除外: `#edited`、`（別角度）` 連打、類似ノート過多
2. 本文を人が編集（事実断定・誇張・出会い系ニュアンスを除去）
3. トラッキングURLを本文末尾 or プロフィール誘導と整合
4. ステータスを `approved`（即時）または `scheduled`（未来時刻）
5. Buffer 接続確認で `classmate0401` が一致していることを再確認
6. `MARKETING_BUFFER_PUBLISH_ENABLED` が **まだ 0** であることを確認

### B. 承認後の実行チェックリスト（運営者が明示承認してから）

1. Vercel Production で一時的に `MARKETING_BUFFER_PUBLISH_ENABLED=1`
2. Redeploy
3. 管理画面から **対象1件のみ**「公開/予約」
4. Buffer と X で下書き/予約/公開を目視確認
5. 成功後すぐに `MARKETING_BUFFER_PUBLISH_ENABLED=0` に戻して Redeploy（自動連投防止）
6. UTM 訪問が `page_visits` / 管理メトリクスに出るか翌日確認

ロールバック:
- ゲートを即 `0` に戻す
- Buffer 側で未送信キューを削除
- X 側は必要なら投稿削除（手動）

---

## 6. 通知設計の確認

現状実装（`lib/marketing/adminNotify.ts`）:

| 種別 | 条件 | 既定 |
|---|---|---|
| `weekly_digest` | 週次で作成された提案一覧 | `MARKETING_ADMIN_NOTIFY_ENABLED≠1` なら送らない |
| `urgent_proposal` | `priority=high` のみ別メール | 同上 |
| チャネル | トランザクションメール（Resend等） | Web Push は管理者向け未対応 |
| 重複 | fingerprint + kind で sent を抑止 | |
| Cron失敗通知 | **未実装** | 管理画面の run ログを見る |

推奨（開始時）:
1. 当面は通知OFFのまま（現状）
2. 有効化するなら:
   - `MARKETING_ADMIN_NOTIFY_ENABLED=1`
   - `MARKETING_ADMIN_NOTIFY_EMAIL`（または `ADMIN_NOTIFY_EMAIL`）
   - `RESEND_API_KEY` / `EMAIL_FROM` が本番で使えること
3. 運用方針: **high 提案（urgent）を主、digest はノイズなら後で絞る**
4. 重大障害は当面 `/admin/marketing` の `marketing_ai_runs`（failed）を日次確認

未実装のため「Cron失敗の即時メール」は今フェーズでは期待しない。

---

## 7. 運営者が次にやること（承認ポイント）

| # | 操作 | 承認が必要 |
|---|---|---|
| 1 | 本番に `OPENAI_MARKETING_API_KEY` を登録し Redeploy | **有料API承認** |
| 2 | `/admin/marketing` で OpenAI 経路の生成を確認 | いいえ |
| 3 | 試験投稿1件の文面を人が確定 | いいえ（内容責任） |
| 4 | 一時的に `MARKETING_BUFFER_PUBLISH_ENABLED=1` → 1件公開 → 即 `0` | **SNS実投稿承認** |
| 5 | （任意）通知ON + 管理者メール設定 | 通知承認 |
| 6 | high 改善提案の採用/保留を管理画面で処理 | いいえ |

エージェント側は本ドキュメント作成とテンプレ品質改善まで。  
**キー投入・実投稿・通知ON・BufferゲートONは実行しない。**
