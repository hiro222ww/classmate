# Classmate iOS / iPadOS 対応ガイド

本番 Web（https://classmate-room.com）の **見た目・挙動は変えず**、iPhone/iPad アプリを **別レイヤー** として構築する手順です。

Apple Developer Program（年 $99）は **まだ不要**。TestFlight / App Store / IAP / APNs Push は後回し。

---

## 方針: Web 版を変えない

| やること | やらないこと |
|----------|--------------|
| Capacitor iOS 殻 + Swift ネイティブ UI | Web 本番への PWA バナー・safe-area 変更 |
| 本番 URL を WebView で読む | 通常 Web ユーザー向けの「ホーム画面に追加」案内 |
| 審査向けネイティブ設定・法務導線 | Web の Home / Room / Call 等の UI 変更 |

**Web 本番に出す必要がないもの（元に戻した / 出さない）**

- `AddToHomeScreenBanner` — 削除済み
- `globals.css` の safe-area 余白 — 元に戻し済み
- `layout.tsx` の `viewportFit` / `appleWebApp` / 追加 icons — 元に戻し済み
- `manifest.webmanifest` の icons 拡張 — 元の最小構成に戻し済み

既存の `manifest.webmanifest` リンクは変更前からあり、**Web の見た目には影響しません**。

---

## このリポジトリの構成

| レイヤー | 場所 | 説明 |
|----------|------|------|
| Web 本番 | `app/`, Vercel | 変更なし方針。ユーザー体験は classmate-room.com のまま |
| Capacitor 設定 | `capacitor.config.ts` | Bundle ID `com.classmate.room`、本番 URL 読み込み |
| iOS プロジェクト | `ios/` | Xcode プロジェクト |
| ネイティブシェル | `ios/App/App/NativeShell/` | 設定・マイク説明・法務導線（**iOS のみ表示**） |
| 設計書 | [IOS_NATIVE_SHELL.md](./IOS_NATIVE_SHELL.md) | App Store 審査向け機能マトリクス |

### ネイティブシェル（最小骨組み）

- **起動画面** — `LaunchScreen.storyboard` / Splash assets
- **マイク許可前説明** — `MicPermissionPrimerViewController`（初回のみ）
- **設定画面** — 利用規約・プライバシー・ガイドライン・問い合わせ・アカウント導線
- **⚙️ ボタン** — WebView 右上（iOS アプリでのみ表示）

Web の通報・ブロック操作は既存のルーム / 通話 UI のまま。ネイティブ設定からガイドラインへリンク。

---

## App Store 審査を見据えた不足機能（現時点）

骨組みはあるが、**提出前に要実装・要確認**:

| 項目 | 状態 | メモ |
|------|------|------|
| アカウント削除（in-app） | 🔶 導線のみ | プライバシーポリシー / メール誘導。審査では API 完結が求められる場合あり |
| 通報フローの審査用説明 | 🔶 Web + ネイティブ説明 | モデレーション体制の App Store 記載 |
| オフライン / 読み込み失敗 UI | ❌ | リモート URL のためネット必須。ネイティブエラー画面を追加予定 |
| 正式アイコン・スプラッシュ | 🔶 仮素材 | `Assets.xcassets` |
| App Privacy Details | ❌ | Developer Program 登録後 |
| Sign in with Apple 要否 | ❓ | Google ログインのみの場合は要確認 |
| APNs Push | ❌ 後回し | Web Push とは別 |
| IAP | ❌ 後回し | Web Stripe のまま |

詳細は [IOS_NATIVE_SHELL.md](./IOS_NATIVE_SHELL.md) を参照。

---

## 0 円でできること（Developer Program 未登録）

### 前提

- macOS + Xcode（無料）
- Node.js / npm
- Apple ID（Personal Team 用）

### 1. セットアップ

```bash
npm install
npm run cap:sync
npm run cap:open:ios
```

### 2. Xcode でビルド

1. ターゲット **App**、シミュレーターまたは実機を選択
2. **Signing & Capabilities** → Personal Team
3. Run（▶）

アプリ起動後:

1. （初回）マイク説明モーダル
2. 本番 Web が WebView に表示
3. 右上 ⚙️ からネイティブ設定

### 3. 実機インストール（Personal Team）

USB 接続 → 実機を Run ターゲットに → 必要なら「デベロッパを信頼」。

**できないこと**: TestFlight、App Store 提出、他者への配布、APNs、IAP。

---

## Apple Developer Program 登録後にやること

### 配布

1. App Store Connect でアプリ作成（Bundle ID: `com.classmate.room`）
2. 本番 Signing / Provisioning
3. TestFlight（内部 → 外部テスター）
4. スクリーンショット・説明文・年齢制限・プライバシーラベル
5. 審査提出

### 実装・整備（優先順）

1. **アカウント削除** — in-app 完結（API + ネイティブ UI）
2. **オフライン / エラー UI** — ネイティブで「接続できません」
3. **正式アセット** — アイコン・スプラッシュ
4. **通話・マイクの実機 QA** — シミュレーターは WebRTC 制限あり
5. **（任意）Web バンドル同梱** — `server.url` を外し更新性と審査リスクのバランスを再検討
6. **APNs / IAP** — プロダクト判断後

---

## 実機検証チェックリスト

Web 本番は変えないため、**Capacitor アプリ** と **Safari の Web** を比較して記録する。

| # | 項目 | 確認内容 |
|---|------|----------|
| 1 | ログイン | Google ログイン、セッション維持 |
| 2 | プロフィール | 表示・編集 |
| 3 | 今のクラスに戻る | 復帰導線 |
| 4 | 音声通話 | 発信・着信・双方向音声 |
| 5 | マイク許可 | ネイティブ primer → システムダイアログ → 通話 |
| 6 | P2P / TURN | モバイル回線、TURN フォールバック |
| 7 | 画面サイズ | iPhone / iPad、縦横 |
| 8 | ネイティブ設定 | ⚙️ → 法務リンク・問い合わせ・アカウント導線 |
| 9 | Web との差分 | Safari タブと比べ、Web 側 UI が変わっていないこと |

### 既知の差分

- **ネイティブ ⚙️ ボタン** — iOS アプリのみ（Web には出ない）
- **マイク primer** — iOS アプリ初回のみ
- **Google ログイン戻り** — iOS アプリのみ `classmate://auth/callback` → WebView の `/auth/callback`（下記）
- **音声ポリシー** — iOS では `voiceMode=ios_conservative`（`lib/voiceClientEnv.ts`）
- **Web Push** — iOS Safari PWA 限定。ネイティブ Push は未実装

---

## Google ログイン（iOS アプリ → アプリに戻る）

iOS アプリは本番 Web（`server.url`）を読み込むため、**OAuth 用の Web 変更は Vercel 本番デプロイ後**にアプリへ反映されます。

### フロー

1. アプリ内 WebView で Google ログイン開始
2. Safari / 外部ブラウザで Google 認証（WebView 内に閉じ込めない）
3. Supabase が `classmate://auth/callback?code=...&returnTo=...` へリダイレクト
4. iOS が Classmate アプリを起動
5. `@capacitor/app` の `appUrlOpen` / `getLaunchUrl` が URL を受信
6. WebView を `https://classmate-room.com/auth/callback?...` へ遷移（query/hash を維持）
7. 既存の `AuthCallbackClient` がセッション確立 → `returnTo` へ

ネイティブ側のバックアップ: `AppDelegate` → `NativeAuthReturnURL` → WebView `load`（JS 起動前のコールドスタート用）。

### Supabase 設定（必須）

[Supabase Dashboard](https://supabase.com/dashboard) → Authentication → URL Configuration → **Redirect URLs** に追加:

```
classmate://auth/callback
```

既存の以下は **削除せず残す**（通常 Web 用）:

```
https://classmate-room.com/auth/callback**
```

ローカル開発用 URL がある場合もそのまま維持。

### iOS 設定（リポジトリ済み）

- `Info.plist` — URL Scheme `classmate`
- `lib/authCallbackUrl.ts` — Capacitor 時のみ `classmate://auth/callback`
- `components/CapacitorAuthReturnBoot.tsx` — `appUrlOpen` ハンドラ

### 実機確認

1. [ ] ログイン後 Safari の Web 版に留まらずアプリに戻る
2. [ ] `/auth/callback` 経由でログイン完了
3. [ ] `returnTo` 先（Home 等）へ遷移
4. [ ] 通常 Safari では従来どおり `https://classmate-room.com/auth/callback`

### 将来: Universal Links（Developer Program 登録後）

Custom URL Scheme の代わりに、本番 HTTPS をアプリで直接開く方式へ移行可能。

| 項目 | 内容 |
|------|------|
| Associated Domains | `applinks:classmate-room.com` |
| `apple-app-site-association` | `https://classmate-room.com/.well-known/apple-app-site-association` に `/auth/callback` パス |
| Redirect URL | `https://classmate-room.com/auth/callback` のまま（Web と共通化） |
| メリット | Safari からシームレスにアプリへ。Scheme 確認ダイアログなし |
| 前提 | Apple Developer Program、本番ドメインで AASA 配信 |

移行時は `buildAuthCallbackUrl` の Capacitor 分岐を Universal Link 優先に切り替え、`classmate://` はフォールバックとして残せる。

---

## よく使うコマンド

```bash
npm run build          # Web ビルド（Vercel と同じ）
npm run cap:sync       # Capacitor / public を ios に反映
npm run cap:open:ios   # Xcode を開く
```

---

## トラブルシューティング

| 症状 | 対処 |
|------|------|
| Signing エラー | Apple ID を Xcode に追加。Bundle ID 衝突時は一時的に suffix を変更 |
| 真っ白な WebView | ネットワーク、本番 URL、`cap sync` 後に再ビルド |
| マイク不可 | 実機で確認。設定アプリのマイク許可、primer を通過したか |
| ネイティブ設定が出ない | `RootContainerViewController` が storyboard の initial VC か確認 |
| ログイン後 Safari に留まる | Supabase Redirect URLs に `classmate://auth/callback` を追加。Web 変更を Vercel 本番へデプロイ済みか確認 |

---

## 関連ファイル

- `capacitor.config.ts` — App 名、Bundle ID、本番 URL
- `lib/capacitorClient.ts` — Capacitor 判定・OAuth 戻り URL 変換
- `components/CapacitorAuthReturnBoot.tsx` — `appUrlOpen` ハンドラ
- [IOS_NATIVE_SHELL.md](./IOS_NATIVE_SHELL.md) — 設計・審査向けロードマップ
- [VERCEL_PROD_DEV.md](./VERCEL_PROD_DEV.md) — Web 本番 / 開発環境
