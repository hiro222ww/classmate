# Classmate E2E（Playwright）

本番公開前の入口フロー・権限・端末状態・URL正規化の模擬試験です。WebRTC 実音声の完全再現は対象外です。

## 実行

```bash
npm run build
npm run e2e:install   # 初回のみ（chromium + webkit）
npm run e2e           # headless（全 project）
npm run e2e:headed    # ブラウザ表示
npm run e2e:report    # HTMLレポート
```

`.env.local` に Supabase 等が設定され、`npm run dev` が起動できる状態が必要です（API 依存テスト）。  
バックエンド不可時は該当テストを `skip` します。

## ブラウザプリセット

| Project | 内容 |
|---------|------|
| chromium | Desktop Chrome |
| webkit | Desktop Safari 相当 |
| iphone | iPhone 13 相当 |
| android | Pixel 7 相当 |

## テストファイル

| ファイル | 内容 |
|---------|------|
| `browser-entry.spec.ts` | 新規ブラウザ・dev 入校 |
| `legacy-device.spec.ts` | 旧 deviceId 自動置換 |
| `mic-permission.spec.ts` | マイク拒否/許可・聞き専 |
| `in-app-browser.spec.ts` | LINE/X/Instagram 等 UA |
| `concurrent-entry.spec.ts` | 3 device 同時 match-join API |
| `rejoin.spec.ts` | Room/Call リロード |
| `url-origin.spec.ts` | classmate-room.com URL 統一 |

## 最新レポート（模擬試験サマリ）

`npm run build && CI=1 npm run e2e` 実行時の観測結果です。

### ブラウザプリセット

| Project | 結果 | 備考 |
|---------|------|------|
| chromium | 19/19 pass | 入校・マイク・URL・再入室すべて通過 |
| webkit | pass | concurrent / mic-grant は project 設定で除外または skip |
| iphone | pass | マイク拒否・聞き専は通過。GUM grant は Chromium のみ検証 |
| android | pass | concurrent は除外 |

### マイク拒否時 UI

- `MicEntryGate`（`aria-label="通話参加の準備"`）が表示される
- 「聞き専で参加」で gate が消え、500・白画面にならない
- マイク許可（GUM mock grant）は **Chromium のみ** で gate 非表示を確認

### 旧 deviceId 自動置換

- `1710000000-abc123` 等の legacy id は UUID に置換
- 入校 API は `invalid_deviceId` で壊れない

### match-join 失敗時 rollback

- `concurrent-entry.spec.ts` で 3 device 同時 API join を検証（2 件以上成功、同一 classId）
- UI 入校は `[match-join] success` コンソールログで確認（レスポンス body はクライアント側で消費されるため）

### URL 統一

- `lib/appOrigin.ts` / `buildInviteRoomUrl` 経由で `https://classmate-room.com`
- 静的チェックで `vercel.app` ハードコードなし

### debugLogs

`?debugLogs=1` 付きで `[home-entry]` `[device]` `[profile]` `[match-prefs]` `[match-join]` `[session-join]` `[room-entry]` `[call-entry]` `[mic]` `[voice-entry]` `[call-ui]` `[voice-cleanup]` が tail ID のみで出力されます。

## 残課題

- 実機 WebRTC / TURN の音声品質は別スクリプト `npm run test:e2e:webrtc`
- WebKit / iPhone でのマイク許可（OS ダイアログ）は Playwright mock では再現不可 → Chromium で代表検証
- CI では `CI=1 E2E_WEB_COMMAND='npm run build && npm run start'` 使用時、`NEXT_PUBLIC_DEV_MODE=true` を build 時にも渡す必要あり
- dev プロファイル未整備時は `global-setup.mjs` が skip し、API 依存テストが skip される
