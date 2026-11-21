# AI Marketing — 14日間 初期運用実験プラン

目的: 投稿数の最大化ではなく、**実測の集客データ → 週次方針 → 次の生成** の改善ループを確立する。

前提（2026-11-21 Asia/Tokyo 確認）:
- OpenAI 生成 / 週次分析 / 運営憲章 / Cron は本番稼働
- Buffer 公開ゲート **OFF**（実投稿は運営者承認後のみ）
- 通知 OFF
- 公開可能投稿は試験候補 **1件のみ** approved

---

## 1. 試験投稿1件 — 最終確認

| 項目 | 値 |
|---|---|
| ID | `ad536d41-bb3a-46bb-9969-c69cdd5c47b1` |
| 状態 | `approved`（他の approved/scheduled は draft 化済み） |
| 送信先 | Buffer → X `@classmate0401`（twitter / 未切断） |
| 本文 | 最近、声で話す相手ってどうしてますか？SNSではつながれても、実際に話す機会は減ってない？ |
| 重複防止 | 成功後 `external_post_id` → `already_sent`。公開APIは ID 指定1件 |
| UTM | `utm_source=x&utm_medium=social&utm_campaign=ai_marketing&utm_content=post_20261121_1` |
| ゲート | `MARKETING_BUFFER_PUBLISH_ENABLED=0`（dry-run で拒否確認済み） |

初回公開手順（承認後のみ）:  
`docs/AI_MARKETING_SNS_OPS_PREP.md` §5 / `/opt/cursor/artifacts/X_TEST_POST_EXECUTION_CHECKLIST_20261121.md`

---

## 2. 14日間の投稿ペース

| 期間 | 目標 | 上限の意味 |
|---|---|---|
| Day 1–3 | **1日1件** | 計測・文体・運用手順の安定化 |
| Day 4–14 | **1日最大2件** | 必須ではない。データが薄い日は1件でよい |
| 合計目安 | 約 **14〜25件** | 憲章上、埋めるための連投は禁止 |

運用ルール:
1. 毎日 Cron が draft を生成（既存日次 Cron 維持）
2. **人間が1〜2件だけ承認 → 手動公開**（無断自動承認なし）
3. 同日に同切り口を重ねない
4. 反応・流入が極端に悪い文面は即停止し、週次方針に回す
5. Buffer ゲートは「公開操作の直前だけ ON → 直後 OFF」を推奨（連投事故防止）

推奨公開帯（仮説・既存 calendar と整合）: **12–13時台 / 20–21時台 JST**  
（週次分析の `preferredHoursJst` で更新される）

---

## 3. 切り口の分散（共感・質問・紹介・参加促進）

既存タイプ対応:

| 切り口 | `post_type` | 14日の目安比率 | 備考 |
|---|---|---|---|
| 共感 | `empathy` / `story` | 30–35% | 宣伝色を抑える |
| 質問 | `question` | 25–30% | 返信・保存を狙う |
| サービス紹介 | `intro` | 20–25% | プロフィール誘導可。誇大禁止 |
| 参加促進 | `invite` | 15–20% | 「短時間でOK」「覗くだけ」系。押し売り禁止 |

ローテーション例（Day1=試験投稿日）:

| Day | 午前/昼 | 夜 |
|---|---|---|
| 1 | — | question（試験投稿） |
| 2 | — | empathy |
| 3 | — | intro（UTM必須） |
| 4 | question | invite |
| 5 | empathy | intro |
| 6 | story | question |
| 7 | — | invite（週次分析日前は抑えめ） |
| 8–14 | 上記比率で最大2件 | 週次方針の preferredTypes を優先 |

参考実装: `lib/marketing/calendar14.ts`（仮説カレンダー。本プランは人間承認運用で再利用）

憲章ガード:
- 強引な登録煽り・実績の捏造・「必ず友達」系は却下
- サービス名連発より共感→質問→紹介の順を基本
- 品質スコア不合格・`charter_needs_review` は公開しない

---

## 4. 投稿ごとの計測可否

既存基盤（追加開発なしで利用可）:

| KPI | 計測 | 仕組み |
|---|---|---|
| 流入（訪問） | ✅ | `page_visits.utm_content` ← 投稿の tracking URL |
| 登録 | ✅ | `product_funnel_events` (`min_profile_saved`) + meta.utm_content |
| 初回通話 | △→✅相当 | `call_started` + utm meta（「成立」専用イベントは未定義＝未計測） |
| 再訪 | △ | ソース単位の uniqueDevices はある。**投稿単位の再訪は未集計** |
| 管理画面 | ✅ | `/admin/marketing` の postPerformance（utm_content 別 visits/reg/call） |

UTM 付与フロー:
1. 生成時に `utm_content=post_YYYYMMDD_N` を採番
2. Buffer 公開時に本文へ tracking URL を連結（280字内）
3. クライアントが UTM を session 保持し page_visit / funnel に付与

ギャップ（最小改善案・既存再利用）:
- **投稿単位の再訪**: `metrics.ts` の content 集計に `device_id` Set を足し、`visits` と `uniqueDevices` を並べる（新規テーブル不要）
- **通話成立**: 現状どおり `call_started` を北星代理指標とし、成立イベントは別フェーズ

---

## 5. 週次分析 → 次回生成への反映

既存ループ（稼働中）:

```
日次 Cron → draft 生成（active strategy の preferredTypes / prompt_addon を参照）
    ↓ 人間承認・公開
週次 Cron → metrics(d7/d28) + 憲章 → report + strategy_version を自動 activate
    ↓
翌日以降の日次生成が新方針を使用
```

確認ポイント:
- `weekly_cron` は `activateStrategy: true`（SNS公開はしない）
- 生成は `getActiveStrategy()` の guidance をプロンプトに注入
- 投稿タイプ別 visits/reg/call が分析スナップショットに入る
- サンプル不足時は heuristic が「断定しない」注記を付ける

不足しうる点と最小対応:
| 不足 | 最小対応（大規模機能なし） |
|---|---|
| 人間が承認しないと公開データが増えない | 本プランの承認運用を守る |
| 再訪が方針に弱い | 上記 uniqueDevices/content を週次プロンプトへ1行追加 |
| 通知OFFで週次を見逃す | 当面 `/admin/marketing` を月曜に確認（通知ONは別承認） |

---

## 6. 14日後の評価計画

評価日: 初回公開日 + 14日（JST）  
データ源: `/admin/marketing` メトリクス + 最新週次レポート + 公開済み posts

### 評価観点

1. **投稿別**: utm_content ごとの visits / registrations / call_started  
2. **切り口別**: empathy/question/intro/invite の転換  
3. **時間帯**: 12時台 vs 21時台  
4. **憲章**: 却下理由の傾向（誇大・類似・不自然）  
5. **運用負荷**: 1日の承認・公開にかかった手数

### 成功の見方（初期実験）

- 「バズ」ではなく、**計測可能な流入が投稿単位で紐づくこと**
- 週次 strategy が preferredTypes を実測寄りに更新していること
- 誇大表現なしで運用が回ること

### 判断アウトプット（14日後に1枚）

- 継続する切り口 Top2 / 止める切り口
- 次の14日の1日上限（1 or 2）
- OpenAI 予算の見直し要否
- Buffer ゲート常時ONに進むか（別承認）

---

## 7. 初回投稿に必要な操作（まだ実行しない）

1. 運営者の **SNS実投稿の明示承認**
2. Vercel: `MARKETING_BUFFER_PUBLISH_ENABLED=1` → Redeploy  
3. `/admin/marketing` で ID `ad536d41-…` のみ公開  
4. X / Buffer 目視  
5. 直ちにゲートを `0` に戻して Redeploy  
6. 翌日 `utm_content=post_20261121_1` の流入有無を確認 → Day2 以降の承認運用開始

---

## 8. 14日運用を開始できるか

| 項目 | 判定 |
|---|---|
| 生成（OpenAI + Cron） | ✅ 可能 |
| 週次フィードバック | ✅ 可能（strategy 自動反映） |
| 憲章チェック | ✅ 可能 |
| 計測（流入・登録・通話開始） | ✅ 可能（投稿単位） |
| 計測（再訪・通話成立） | △ 代理指標 / 最小改善候補あり |
| 試験投稿候補 | ✅ 1件 ready |
| 実投稿 | ❌ ゲートOFF・承認待ち |

**結論:** 計画・計測・改善ループの準備は整っている。  
**ブロッカーは運営者による初回1件の公開承認のみ。** 承認後、本ドキュメントのペースで14日実験を開始できる。
