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
| アプリ専用 Web UI | `app/app/*` | Capacitor からだけ利用。`/app/home` `/app/login` `/app/settings` |
| Capacitor 設定 | `capacitor.config.ts` | 起動 URL `https://classmate-room.com/app` |
| iOS プロジェクト | `ios/` | Xcode プロジェクト（iPhone/iPad ユニバーサル） |
| ネイティブシェル | `ios/App/App/NativeShell/` | マイク説明・⚙️（通常非表示） |
| 設計書 | [IOS_NATIVE_SHELL.md](./IOS_NATIVE_SHELL.md) | App Store 審査向け機能マトリクス |

### Web 版とアプリ版 UI の分離

| | Web ブラウザ | iOS アプリ |
|--|-------------|-----------|
| トップ / ホーム | `/` | `/app/home` |
| ログイン | `/login` | `/app/login` |
| 設定 | `/settings` | `/app/settings` |
| 課金 | `/premium`, `/billing` | 同上（アプリ内 WebView から遷移） |
| Room / Call | 既存 | 既存 Web を流用 |

通常ブラウザで `/app/*` を開くと `/` へ戻ります（`noindex`）。

### 課金・通知の方針

- **課金**: 既存 Web Stripe 体系をそのまま利用。`/app/settings` から `/premium`・`/billing` へ。App Store 提出前に **IAP 要否は TODO**
- **Web Push**: Web 版のみ（VAPID + `/api/push/*`）。変更なし
- **iOS Push**: Web Push とは別。APNs は Developer Program 後に実装。アプリ内では「準備中」表示のみ

### 対応プラットフォーム

| プラットフォーム | 方針 |
|----------------|------|
| iPhone / iPad | 1 つのユニバーサル iOS アプリ（`com.classmate.room`） |
| Android / Windows | 当面 Web 版のみ。専用アプリは着手しない |
| Mac | 今すぐ本格対応しない（将来: iPad アプリの Mac 実行 or Catalyst） |

### ネイティブシェル（最小骨組み）

- **起動画面** — `LaunchScreen.storyboard` / Splash assets
- **マイク許可前説明** — `MicPermissionPrimerViewController`（初回のみ）
- **設定画面** — `/app/settings`（アプリ専用 Web UI）に集約
- **⚙️ ボタン** — 通常は非表示。表示時も `/app/settings` を開く

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
| IAP | ❌ TODO | Web Stripe のまま。App Store 前に要否検討 |
| APNs Push | 🔶 準備中 UI | Web Push とは別実装 |

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
2. `/app/home`（アプリ専用ホーム）が表示
3. 下部タブまたは設定リンクから `/app/settings`

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
| 1 | 起動 | `/app` → `/app/home` が開く |
| 2 | ログイン | Google ログイン → `/app/home` に戻る |
| 3 | プロフィール | `/profile`（既存 Web） |
| 4 | 今のクラスに戻る | `/app/home` → `/room` |
| 5 | 音声通話 | 発信・着信・双方向音声 |
| 6 | マイク許可 | ネイティブ primer → システムダイアログ → 通話 |
| 7 | 画面サイズ | iPhone / iPad、縦横、Split View |
| 8 | アプリ設定 | `/app/settings`（課金・法務・通知説明） |
| 9 | Web との差分 | Safari タブと比べ、通常 Web UI が変わっていないこと |

### 既知の差分

- **ネイティブ ⚙️** — 通話・ルーム等では非表示。設定は `/app/settings`
- **マイク primer** — iOS アプリ初回のみ
- **Google ログイン戻り** — `classmate://auth/callback` → `/auth/callback` → `returnTo`（例: `/app/home`）
- **音声ポリシー** — iOS では `voiceMode=ios_conservative`
- **Web Push** — Web 版のみ。iOS アプリでは Web Push ボタンを出さず APNs 準備中表示

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
7. 既存の `AuthCallbackClient` がセッション確立 → `returnTo` へ（例: `/app/home`）

ネイティブ側は Capacitor `ApplicationDelegateProxy` のみ（WebView 二重 load なし）。

### Supabase 設定（必須）

[Supabase Dashboard](https://supabase.com/dashboard) → Authentication → URL Configuration

**Site URL**（確認）:

```
https://classmate-room.com
```

`/?code=...` に戻ってしまう場合、多くは **Redirect URLs に callback パスが無い** ため Site URL へフォールバックしています。以下を **すべて** 登録してください（既存は削除しない）:

**Redirect URLs**:

```
classmate://auth/callback
classmate://auth/callback**
https://classmate-room.com/auth/callback
https://classmate-room.com/auth/callback**
```

ローカル開発がある場合の例:

```
http://localhost:3000/auth/callback
http://localhost:3000/auth/callback**
```

**OAuth redirectTo の形式**（コード側）:

| 環境 | redirectTo |
|------|------------|
| 通常 Web | `https://classmate-room.com/auth/callback`（クエリなし） |
| iOS/Capacitor | `classmate://auth/callback`（クエリなし） |

`returnTo` は `sessionStorage` に保存し、`/auth/callback` で復元します（Supabase の URL 一致を安定させるため）。

**保険**: それでも `https://classmate-room.com/?code=...` に来た場合、アプリは自動で `/auth/callback?code=...` へ転送します。

### iOS 設定（リポジトリ済み）

- `Info.plist` — URL Scheme `classmate`
- `lib/authCallbackUrl.ts` — Capacitor 時のみ `classmate://auth/callback`
- `components/CapacitorAuthReturnBoot.tsx` — `appUrlOpen` ハンドラ

### 実機確認

1. [ ] ログイン後 Safari の Web 版に留まらずアプリに戻る
2. [ ] `/auth/callback` 経由でログイン完了
3. [ ] `returnTo` 先（`/app/home` 等）へ遷移
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
| ログイン後 Safari に留まる / `/?code=...` | Redirect URLs 4 件をすべて登録（上記）。Web 変更を Vercel 本番へデプロイ。Xcode コンソールの `[oauth-start]` ログで `redirectTo` を確認 |

---

## 関連ファイル

- `capacitor.config.ts` — App 名、Bundle ID、本番 URL
- `app/app/` — アプリ専用 UI（`/app/home`, `/app/login`, `/app/settings`）
- `components/app-shell/` — AppShellGate, AppShellPage, 下タブ
- `lib/appShell.ts` — アプリ専用パス定数
- `components/CapacitorAuthReturnBoot.tsx` — `appUrlOpen` ハンドラ
- [IOS_NATIVE_SHELL.md](./IOS_NATIVE_SHELL.md) — 設計・審査向けロードマップ
- [VERCEL_PROD_DEV.md](./VERCEL_PROD_DEV.md) — Web 本番 / 開発環境
