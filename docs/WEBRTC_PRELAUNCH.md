# WebRTC 通話 — 公開前テスト

最終更新: 2026-05-26

## E2E 結果の読み方（2026-05-26）

### peer mesh FAIL + reload PASS の典型原因

| 観察 | 解釈 |
|---|---|
| reload で `connected=2 tracks=2` | **WebRTC 本体は成功**している |
| 初回 peer mesh のみ FAIL | **E2E 待機条件・順序の問題**が多い |

1. **順序問題**: 旧実装は client ごとに **直列** `waitForPeerMesh(120s)`。3 人だと 1 人目の待機中に他 client の mesh 形成が進むが、1 人目だけタイムアウトしうる。reload 時は dev2/dev3 が既に安定しているため dev1 だけ即 reconnect 成功。
2. **判定条件は実装と概ね一致**: `connected` / ICE `connected|completed` / `remoteTracks` は init script hook と `usePeerConnections` の `connectionState` / `ontrack` に対応。ただし UI 側は member chip **「接続中」**（`peerState === "connected"`）も有効な成功信号。
3. **mute/unmute FAIL は WebRTC ではない**: 解除後 fake mic が音を出す → `micLevel > 0.08` → chip が **「自分 / 発話可能」ではなく「発話中」** に上書きされる（`CallClient.tsx` L792）。E2E が存在しない文言を待っていただけ。

### 修正済み E2E 改善

- peer mesh: **全 client 並列待機** + UI「接続中」フォールバック + PC 初期 state 記録
- mute/unmute: ボタンラベル（`ミュート` / `ミュート解除`）と **「発話中」** も unmute 成功として扱う

### 本当に残る blocker（WebRTC 本体）

| ID | 内容 | 根拠 |
|---|---|---|
| R1 | 実機 Safari / Android の WebRTC | Chromium E2E では未検証 |
| R2 | 実音声・BT ルーティング | fake media では不可 |
| R3 | バックグラウンド / 画面ロック復帰 | E2E 未カバー |
| R4 | TURN / 厳しい NAT | localhost mesh 成功 ≠ 本番 NAT |

**E2E FAIL（peer mesh / mute）だけでは公開 blocker にしない。** reload で mesh 成功 + forbidden error なしなら、スタックは基本 OK。

### 公開前に実機で確認すべき項目

1. iPhone Safari: 2 人 call、双方向音声、reload 30 秒以内復帰
2. Android Chrome: 同上 + バックグラウンド 1 分復帰
3. Windows Chrome: 3〜5 人 mesh、mute 中に相手へ音が流れないこと
4. Bluetooth イヤホン: 出力切替
5. 入校時間外 UI（admission）と match-join 整合

---

### 前提

- アプリ起動（通常 `npm run dev`）かつ `NEXT_PUBLIC_DEV_MODE=true`
- `.env.local` に Supabase URL / service role key
- **専用 deviceId**: `webrtc-test-device-1..N`（URL `?dev=webrtc1`）— `test-device-*` とは別 namespace
- テスト開始前に `webrtc-test-device-*` の membership / presence のみ cleanup（既存ユーザーは不変）
- 入校時間外の場合、`global_join_window` を E2E 中だけ一時 `enabled=false` にし終了後 restore
- Playwright + Chromium:

```bash
npm i -D playwright
npx playwright install chromium
```

### 実行

```bash
# 3 クライアント（デフォルト）
npm run test:e2e:webrtc

# クライアント数・UI 表示
node scripts/e2e-webrtc-call.mjs --clients 5 --headed

# 本番向け（API + UI 同一オリジン）
node scripts/e2e-webrtc-call.mjs \
  --api-base https://classmate-zeta-one.vercel.app \
  --base-url https://classmate-zeta-one.vercel.app
```

### 自動検証項目

| 項目 | 内容 |
|---|---|
| 同一 session | dev1 が match-join → dev1..N が session/join |
| call 遷移 | `/call?classId&sessionId&dev=N` |
| getUserMedia | Chromium fake device + init script フォールバック |
| micReady | 「ミュート解除 / ミュート」ボタンが有効化 |
| peer mesh | `RTCPeerConnection` hook: `connected` / ICE / remote track |
| mute/unmute | dev=1 で chip「発話可能 ↔ ミュート中」 |
| reload 復帰 | dev=1 reload 後に mic + peer 再確立 |
| console | `[error]` / `pageerror` 収集 |
| 禁止エラー | `AbortError` / `NotAllowedError` / `InvalidStateError` |

### 自動化できない理由（手動へ）

- 実機ブラウザの WebRTC 実装差（Safari / Android）
- Bluetooth ルーティング・OS オーディオポリシー
- 人間の耳による音声品質確認
- 画面ロック / バックグラウンド時の OS サスペンド

---

## 手動テストチェックリスト

各項目: **端末 / ブラウザ** · **手順** · **期待結果** · **結果 (PASS/FAIL/NA)** · **メモ**

### iPhone Safari

- [ ] 2 人で同一 room → call 入室
- [ ] 初回マイク許可ダイアログ → 許可後に「ミュート解除」が有効
- [ ] 相手の声が聞こえる（スピーカー / 受話口）
- [ ] ミュート / 解除が相手側に反映（発話 UI / 実音声）
- [ ] タブ再読み込み後 30 秒以内に再接続
- [ ] 画面ロック → 解除後に音声復帰
- [ ] バックグラウンド（他アプリ）→ 復帰後に音声復帰
- [ ] Console に `NotAllowedError` / `InvalidStateError` が出ない

### Android Chrome

- [ ] 上記と同様（2 人 call）
- [ ] 省電力 / バックグラウンド制限 ON でも復帰可能か
- [ ] Bluetooth イヤホン接続時の入出力切替

### Windows Chrome / Edge

- [ ] 2〜5 人 call（フルメッシュ）
- [ ] デフォルトマイク / スピーカーで双方向音声
- [ ] ミュート中は相手に音声が流れない
- [ ] reload 後 reconnect（30 秒以内目安）
- [ ] DevTools Console: peer `connected`, ice `connected|completed`

### Bluetooth イヤホン

- [ ] 通話前に BT 接続 → 音声が BT 出力
- [ ] 通話中に BT 切断 → 内蔵スピーカーへフォールバック（または明示エラー）
- [ ] BT マイク入力で相手に聞こえる

### 音声・UX（人間確認）

- [ ] エコー / ハウリングが許容範囲
- [ ] 一人が話している間、他者の音声が自然（遅延 < 500ms 目安）
- [ ] autoplay ブロック時にユーザー操作で復帰できる

### 画面ロック / バックグラウンド

- [ ] iOS Safari: ロック 1 分 → 復帰後 30 秒以内に音声
- [ ] Android: ホーム押下 1 分 → 復帰後 reconnect
- [ ] デスクトップ: タブ非アクティブ 5 分 → 復帰後 reconnect

---

## WebRTC ログ改善案

現状は `console.log/warn/error` が散在し、E2E / 本番調査で grep しづらい。

### 1. 構造化ログ（推奨）

`usePeerConnections.ts` / `useLocalMic.tsx` / `RemoteAudio.tsx` で共通プレフィックス:

```json
{
  "tag": "voice",
  "event": "peer_state",
  "deviceId": "test-device-1",
  "remoteId": "test-device-2",
  "connectionState": "connected",
  "iceConnectionState": "connected",
  "sessionId": "...",
  "ts": 1710000000000
}
```

### 2. 接続フェーズの一本化

| 現状 | 改善 |
|---|---|
| `notifyStatus` 文字列のみ | `voice_status` イベント + UI 用短文案 |
| `[voice-peer] offer effect check` が verbose | `LOG_VOICE_DEBUG=1` 時のみ出力 |
| remote track 受信ログなし | `ontrack` で `{ remoteId, trackId, kind }` を 1 行 JSON |

### 3. エラー分類

| エラー | ログ field | 対応 |
|---|---|---|
| `NotAllowedError` | `mic_permission_denied` | UI: 設定案内 |
| `AbortError` | `gum_aborted` | reload / device 変更 |
| `InvalidStateError` | `pc_invalid_state` | connectionId + signal_type |
| ICE failed | `ice_failed` + route stun/turn | TURN fallback 結果を同ログに |

### 4. `/api/voice-connection-log` 連携

`connected` / `failed` は既に POST あり。追加推奨:

- `ice_failed`, `turn_fallback`, `remote_track_received`
- `sessionId`, `remoteId`, `connectionId` を必須化

### 5. E2E 向けフック

`NEXT_PUBLIC_VOICE_E2E=1` 時のみ `window.__webrtcTest` をアプリ側でも更新（Playwright init script と二重でも可）。

---

## 公開前 blocker 一覧

| ID | 深刻度 | 項目 | 状態 | 備考 |
|---|---|---|---|---|
| B1 | **高** | 同時 match-join で session 分裂 | **要再確認** | advisory lock 適用後 n=30→6 は改善。本番 wave でも監視 |
| B2 | **高** | 実機 Safari WebRTC | **手動必須** | 自動 E2E は Chromium のみ |
| B3 | **高** | マイク拒否 / autoplay | **手動必須** | `NotAllowedError` は実機ポリシー依存 |
| B4 | **中** | TURN 未設定時の NAT 越え失敗 | **要確認** | STUN のみで ICE failed → TURN fallback パスを本番で検証 |
| B5 | **中** | test-device membership 蓄積 | **解消（WebRTC E2E）** | `webrtc-test-device-*` に隔離 + cleanup |
| B6 | **中** | admission window | **要確認** | 管理画面 `global_join_window` と API 整合（修正済みなら deploy 順序） |
| B7 | **低** | ログ不足による障害調査遅延 | **改善案あり** | 上記ログ改善 |
| B8 | **低** | forming のみ E2E | **既知** | active 遷移 + 長時間 call は手動 |

### 公開 GO 条件（提案）

1. `npm run build` PASS
2. `npm run test:prelaunch` PASS（API スイート）
3. `npm run test:e2e:webrtc` PASS（ローカル or staging）
4. 手動チェックリスト: iPhone Safari + Android Chrome + Windows Chrome で **双方向音声 PASS**
5. blocker B1/B4 が staging で再現しない

---

## 関連ファイル

| ファイル | 役割 |
|---|---|
| `scripts/e2e-webrtc-call.mjs` | Playwright 2–5 クライアント E2E |
| `scripts/lib/webrtc-test-utils.mjs` | media mock / log hooks / helpers |
| `scripts/e2e-enter-room.mjs` | select → room UI 経路 |
| `app/call/voice/usePeerConnections.ts` | WebRTC コア |
| `docs/PRELAUNCH_E2E_REPORT.md` | match-join / zombie 等の API E2E |
