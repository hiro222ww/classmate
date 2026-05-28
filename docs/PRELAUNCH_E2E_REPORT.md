# classmate 本番公開前 E2E / 負荷 / 復旧テスト — 成果物

最終更新: 2026-05-26

## 自動テストの実行

```bash
# 全スイート（build + probe + E2E API tests）
npm run test:prelaunch

# 本番 API 向け
npm run test:prelaunch -- --api-base https://classmate-zeta-one.vercel.app

# UI E2E も含める（要 playwright）
npm i -D playwright && npx playwright install chromium
npm run test:prelaunch

# build 省略
node scripts/run-prelaunch-tests.mjs --skip-build --api-base https://...
```

| スクリプト | 内容 |
|---|---|
| `scripts/probe-match-join-v3.mjs` | RPC + gender + mine TTL |
| `scripts/e2e-concurrent-join.mjs` | dev1..30 同時 match-join + session/join |
| `scripts/e2e-recovery.mjs` | normal vs openJoinedClass / stale ガード |
| `scripts/e2e-zombie-stale.mjs` | TTL expire / presence / members scope |
| `scripts/e2e-growth.mjs` | forming 増殖 / orphan class / 命名 |
| `scripts/e2e-entitlements.mjs` | class_slots 反映 / mine 整合 |
| `scripts/e2e-enter-room.mjs` | Playwright: select→room UI 経路 |

---

## 1. 同時入室 E2E（dev 1–30）

### 実装

- `scripts/e2e-concurrent-join.mjs`
- `test-device-1` … `test-device-N`（URL の `?dev=N` と同じ ID）
- シナリオ: **free** + **open topic** を `Promise.all` 同時実行

### 検証項目

| 項目 | 方法 |
|---|---|
| session 分裂 | 同一 wave の session_id ごとに DB member count ≤ capacity |
| capacity 超過 | `session_members` count vs `sessions.capacity` |
| stale/active 誤入室 | `session_status ∉ {active,closed,expired}` |
| class_slots 誤発火 | 失敗時 `billableMembershipCount` / `legacyMembershipCount` をログ |
| 同一 user 複数 session | wave 内 deviceId 重複なし |
| 新 class race | `createdNewClass` が `ceil(n/2)+2` 以下 |

### ログ出力（JSON 1 行 / join）

```json
{
  "tag": "match:free",
  "deviceId": "test-device-1",
  "class_id": "...",
  "session_id": "...",
  "reused": false,
  "created_new_class": true,
  "current_count": 4
}
```

### 既知リスク（未解決）

| リスク | 深刻度 | 説明 |
|---|---|---|
| 同時新規 class 増殖 | **中→高** | **再現済**: dev30 同時 free join で 7 class / 7 session 生成（capacity=5 なら ideally ~6）。advisory lock ありも同時 wave では分裂 |
| test-device 既存 membership | **中** | 検証データが溜まっていると `class_slots_limit` SKIP 増加。`legacy_membership_cleanup_proposal.sql` 参照 |
| forming→active | **低** | 本スクリプトは forming 入室まで。active 遷移は手動 call E2E が必要 |

---

## 2. zombie / stale cleanup

### 自動

- `scripts/e2e-zombie-stale.mjs`
  - mine 呼び出し前後の stale forming
  - mine が stale を「募集中」にしない
  - presence GET: 2 分超 heartbeat → offline
  - members API: `sessionId` 指定時 `session_members` ソース

### 手動再現チェックリスト（iPhone / ブラウザ）

| 操作 | 期待 |
|---|---|
| タブ閉じる | 2–3 分後 online 消える |
| 強制終了 | `is_in_call` / call screen 残留なし（5 分以内） |
| WiFi 切断 | presence stale → offline（通話は別途 ICE 切断） |
| sleep 復帰 | room reload 後 sessionId 維持 or 新規 match |
| background 復帰 | CallClient unmount で `screen:room` 送信済み |
| refresh 連打 | 古い session URL に戻らない（normal path） |

### 推奨 heartbeat / TTL

| レイヤ | 現状 | 推奨 |
|---|---|---|
| presence GET | 2 分 active | **2 分維持**（ホーム） |
| presence POST interval | 15s home / 10s room/call | **15s 統一** |
| call is_in_call | presence `screen=call` + 20s fresh | session/status 20s — **30s に緩和検討** |
| forming TTL | app_settings 5/10/15/無制限 | **cron expire 5 分**（下記） |

### 非破壊 cleanup SQL

- `supabase/sql/stale_presence_cleanup_proposal.sql`
- `supabase/sql/legacy_membership_cleanup_proposal.sql`

---

## 3. iPhone Safari / モバイル（手動必須）

**自動化不可 — 公開 blocker 候補**

| 項目 | 確認 | 既知リスク |
|---|---|---|
| 初回マイク許可 | room→call で prompt | iOS 15+ ユーザー gesture 必須 |
| audio autoplay | remote audio 聞こえる | **Safari autoplay — blocker 候補** |
| room→call | sessionId 維持 | OK（URL パラメータ） |
| reload 復帰 | 同一 session or 募集停止 | stale guard 依存 |
| background | 通話中表示残留 | presence cleanup 依存 |
| 画面回転 | canvas / layout | 要実機 |
| blackboard sync | SharedCanvasBoard | WebSocket/Realtime 要確認 |
| remote audio | usePeerConnections | TURN 率監視 |
| mic mute | ローカル track enabled | — |
| AbortError | getUserMedia 再試行 | CallClient 要確認 |
| InvalidStateError | RTCPeerConnection state | signaling 順序 |
| remote stream lost | ICE restart / reconnect | **中リスク** |

**推奨**: TestFlight 前に iPhone 14/15 Safari で 30 分通話セッション 1 本。

---

## 4. 無限 session/class 増殖

### 自動

- `scripts/e2e-growth.mjs`
  - 1h forming 数 < 500（sanity）
  - 24h 新 class の orphan サンプル
  - normal match が joined class 再利用しない
  - `expired` status 存在

### 推奨 cleanup cron（Supabase pg_cron または GitHub Actions + service role）

```sql
-- 毎 5 分: stale forming/waiting → expired（TTL 設定読込）
-- 毎日: legacy membership 一覧レポート（DELETE は手動）
-- 毎週: session_members where session.status=expired and joined_at < now()-7d → アーカイブ検討
```

### 推奨 DB index

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_class_status_created
  ON public.sessions (class_id, status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_session_members_session
  ON public.session_members (session_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_class_memberships_device
  ON public.class_memberships (device_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_class_presence_class_last_seen
  ON public.class_presence (class_id, last_seen_at DESC);
```

---

## 5. recovery / reload

### 自動

- `scripts/e2e-recovery.mjs`
  - normal: 既参加 class 除外
  - openJoinedClass: 指定 class 維持 + slots 不ブロック
  - 2 回目 normal: stale status 返却なし

### 手動

| 操作 | 期待 |
|---|---|
| room reload | session/join refresh OK |
| call reload | getUserMedia 再取得 |
| rematch（normal） | 新 class / fresh forming |
| rematch（openJoinedClass） | 旧 class OK |
| session_closed | 403 + 適切 UI |
| recruitment_closed | alert / 募集終了表示 |

---

## 6. Stripe / entitlements

### 自動

- `scripts/e2e-entitlements.mjs`
  - DB → `/api/user/entitlements` → `/api/class/mine` の `class_slots` 一致
  - upsert 後即反映（キャッシュなし）
  - match-join レスポンスに `classSlots`

### 手動（公開前）

| 項目 | 手順 |
|---|---|
| slots 反映 | checkout → webhook → `/api/billing/sync` |
| webhook 遅延 | 5 分後 refresh で slots 更新 |
| 解約後 | portal cancel → webhook → slots=1 |
| stale entitlement | mine の `membership_count_billable` vs slots |

---

## 7. ログ・監視

### 現状

- `[class/match-join-v2]` success/warn ログあり
- RPC error → `formatPostgresError` detail
- Vercel logs: リクエスト単位、session lifecycle は分散

### 推奨（公開後すぐ）

| 項目 | 内容 |
|---|---|
| requestId | `x-request-id` UUID を match-join / session-join レスポンス header に |
| structured logs | `{ event, deviceId, classId, sessionId, sessionStatus, reused, createdNewClass, billableCount, classSlots }` |
| session lifecycle | `session.created / member.join / session.expired / session.active` |
| alert | Vercel: 5xx rate > 1% on `/api/class/match-join-v2` |
| alert | Supabase: RPC `match_join_atomic_v3` error rate |
| alert | `class_slots_limit` 急増（>100/h） |
| dashboard | forming 数 / expired 数 / 新 class 数（時間別） |

---

## 再現した問題一覧（コードレビュー + 過去修正）

| # | 問題 | 状態 |
|---|---|---|
| 1 | legacy membership が slots にカウント | **修正済**（billable count） |
| 2 | presence POST camelCase 不一致 | **修正済** |
| 3 | Home presence `items` 未読 | **修正済** |
| 4 | normal match が joined class 再利用 | **修正済**（RPC 220000） |
| 5 | 30 同時 join で class 増殖 race | **再現済** — 7 sessions / 6 new classes（30 dev free wave）。capacity 内だが class 分裂 |
| 6 | iPhone autoplay / ICE | **手動未検証 — blocker 候補** |
| 7 | Playwright UI E2E 未 CI 化 | **optional devDependency** |

---

## 本番公開 blocker

| blocker | 必須対応 |
|---|---|
| SQL migration 220000 未適用 | Supabase 適用 + `NOTIFY pgrst` |
| iPhone Safari 通話 30 分実機 | 手動 PASS |
| legacy membership 整理 | SELECT → 必要なら DELETE |
| Vercel deploy 最新 TS | presence / slots / 募集終了 label |

**非 blocker（公開後）**: pg_cron expire、requestId、Playwright CI

---

## future migration 候補

1. `20260526230000` — scheduled expire function + pg_cron
2. `session_members` partial unique index（device 単一 active session — 要設計）
3. `class_presence.last_seen_at` index + cleanup function

---

## 関連 SQL migration 適用順

1. `20260526200000` — joined exclude + クラスNNNNX
2. `20260526210000` — TTL unlimited
3. `20260526220000` — billable class_slots
