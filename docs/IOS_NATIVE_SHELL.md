# iOS ネイティブシェル設計（App Store 審査向け）

Classmate の **Web 版（classmate-room.com）の UI・導線・余白は変更しない**。iPhone/iPad アプリは **別レイヤー** として `ios/App/App/NativeShell/` に置く。

## 基本方針

| 原則 | 内容 |
|------|------|
| Web 本番を変えない | PWA バナー、safe-area 上書き、Web 専用メタデータ強化は出さない |
| ネイティブは iOS のみ | Swift/UIKit。Capacitor WebView の外側・上に載せる |
| 中身は当面リモート | `capacitor.config.ts` の `server.url` で本番 Web を読む |
| 審査を見据える | ただの殻ではなく、設定・法務・マイク説明など **ネイティブ画面を最低限** 持つ |

## アーキテクチャ

```
┌─────────────────────────────────────┐
│  RootContainerViewController (Swift) │
│  ┌───────────────────────────────┐  │
│  │  ⚙️ 設定ボタン（ネイティブのみ）  │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │  CAPBridgeViewController       │  │
│  │  → https://classmate-room.com/app │
│  │    （アプリ専用 UI → Room/Call は既存 Web）│
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
         │ 初回起動
         ▼
┌─────────────────────────┐
│ MicPermissionPrimer      │  ← システム許可の前説明
└─────────────────────────┘
         │ ⚙️ タップ（通常は非表示）
         ▼
┌─────────────────────────┐
│ /app/settings（WebView） │  ← アプリ専用設定に集約
└─────────────────────────┘
```

### なぜ Web に専用 route を足すのか（2025 段階導入）

以前は「Swift だけでネイティブ画面を持つ」方針だったが、**入口・ホーム・設定** については App Store 向けに **アプリ専用 Web UI**（`/app/*`）を段階導入する。

| 層 | 役割 |
|----|------|
| **通常 Web**（`/`, `/home`, `/login`, `/settings` 等） | 変更しない。SEO・既存ユーザー・Stripe 導線は現状維持 |
| **アプリ専用 Web**（`/app`, `/app/home`, `/app/login`, `/app/settings`） | Capacitor ネイティブ殻からだけ開く。通常 Web 導線からはリンクしない |
| **Swift ネイティブ**（`NativeShell/`） | 法務シート・マイク primer・起動 URL。WebView の外側 |

### Web 版とアプリ版 UI の分離方針

```
Capacitor 起動
  → https://classmate-room.com/app
  → /app/home（アプリ専用ホーム）

通常ブラウザで /app/* を開いた場合
  → AppShellGate が / へリダイレクト（noindex）

Room / Call / Profile
  → 既存 Web 版をそのまま利用（通話安定性優先）
```

| ルート | Web ブラウザ | iOS アプリ |
|--------|-------------|-----------|
| `/`, `/home`, `/login`, `/settings` | ✅ そのまま | 使わない（直リンクは可） |
| `/app/home`, `/app/login`, `/app/settings` | ❌ `/` へ戻す | ✅ 専用 UI |
| `/room`, `/call`, `/profile` | ✅ そのまま | ✅ 既存 Web を流用 |

**実装の要点**

- `lib/appShell.ts` — パス定数・`isAppShellPath()`
- `components/app-shell/AppShellGate.tsx` — `isCapacitorNativeApp()` でガード
- `components/app-shell/AppShellChrome.tsx` — safe-area 余白・ルート footer 非表示
- `capacitor.config.ts` — `server.url: https://classmate-room.com/app`
- `AppAccountNav` — `/app/*` では非表示
- `SettingsGearVisibilityPolicy` — 通話・ルーム・アプリ専用画面・既存 Web 画面ではネイティブ ⚙️ 非表示。表示時も `/app/settings` を開く

### `/app` 専用ルートの役割

| ルート | 役割 |
|--------|------|
| `/app` | 起動入口 → `/app/home` へリダイレクト |
| `/app/home` | アプリ専用ホーム（クラス復帰・参加・プロフィール） |
| `/app/login` | Google / Apple（準備中）ログイン |
| `/app/settings` | アカウント・課金・通知・安全・法務の集約 |

### 課金方針（既存 Web 版に則る）

- **新規課金 API は作らない**。Web 版と同じ Stripe 体系を利用する
- `/app/settings` から `/premium`（プラン変更）・`/billing`（請求管理）へ **アプリ内 WebView** で遷移
- 権限表示は `fetchAuthStatus` の entitlements（Free / Slots 3 / Slots 5、テーマ支援額）
- 「権限を再同期」は既存 `POST /api/billing/sync` を呼ぶ
- **TODO（App Store 提出前）**: デジタルコンテンツ課金について **IAP 対応が必要になる可能性** あり。現時点では Web Stripe を壊さない

### 通知方針（Web Push と iOS Push は別物）

| | Web 版 | iOS アプリ版 |
|--|--------|-------------|
| 技術 | VAPID + Service Worker + `/api/push/*` | 将来 APNs + `@capacitor/push-notifications` |
| 現状 | 既存 UI のまま維持 | 「準備中」説明のみ。**Web Push トグルは出さない** |
| イベント | `class_call_requested` 等 | 同じイベント名を共通利用し、送信先だけ `web` / `ios` で分岐予定 |
| 前提 | ブラウザ | Apple Developer Program 加入後に本実装 |

### iPhone / iPad ユニバーサルアプリ

- **Bundle ID・バイナリは 1 つ**（`com.classmate.room`）
- ログイン・課金・Supabase/API/DB・Room/Call ロジックは Web と共通
- UI のみ画面幅で最適化（iPhone: 1 カラム + 下タブ、iPad: 2 カラム + 幅広レイアウト）

### Android / Windows / Mac

- **Android / Windows**: 当面 Web 版（classmate-room.com）で対応。専用アプリは着手しない
- **Mac**: 今すぐ本格対応しない。将来は iPad ユニバーサルアプリの Apple Silicon Mac 実行、または Mac Catalyst を検討

OAuth の `returnTo` は `/app/home` を指定可能。`/auth/callback` は共通のまま。OAuth code の二重処理防止は `lib/oauthCallbackDedupe.ts` を維持。

### 以前の方針（Swift のみ）との関係

- 法務文書は Web に既にある（`/terms`, `/privacy`, `/guidelines`）→ **アプリ設定からも同 URL を参照** し、二重管理を避ける
- マイク primer・審査用の Swift 画面は引き続き `NativeShell/` で維持

### 将来案

`X-Classmate-Client: ios` ヘッダー付きのサーバー側ガードは、必要になったら追加可能。現状はクライアントの `AppShellGate` のみ。

## ⚙️ 表示制御（iOS のみ・Web 変更なし）

| ファイル | 役割 |
|----------|------|
| `SettingsGearVisibilityPolicy.swift` | WebView の `url.path` から ⚙️ 表示可否を判定 |
| `SettingsGearLayout` | 位置定数（`topInset` / `trailingInset` / `size`）。制約を変えるだけで移動可能 |

- **現状**: `/app`・`/call`・`/room`・`/profile`・`/class`・課金・法務ページ等では ⚙️ 非表示（通話 UI 優先）
- **表示時**: `RootContainerViewController.openSettings()` は `/app/settings` を WebView で開く（`AppSettingsViewController` はレガシー）
- **監視**: `RootContainerViewController` が `bridgeViewController.webView` の `url` を KVO 監視（Capacitor 公開 API のみ。Web 側コード不要）
- **拡張**: `hiddenPathPrefixes` にパスを足す、または `SettingsGearLayout` の定数を変えて位置だけずらす

## マイク primer の表示タイミング（切り替え可能）

| ファイル | 役割 |
|----------|------|
| `MicPermissionPrimerCoordinator.swift` | 表示タイミングの単一窓口 |

```swift
enum MicPermissionPrimerPlacement {
    case onFirstLaunch      // 現状（既定）
    case beforeFirstCall    // 将来: placement をこれに変えるだけ
}
```

- **現状** (`onFirstLaunch`): 初回起動の `viewDidAppear` で 1 回だけ表示
- **将来** (`beforeFirstCall`): 同じ URL 監視で `/call` 遷移時に `shouldPresentBeforeCall` が true になったら表示。`placement` の 1 行変更 + 起動時 present を外すだけで移行可能（Web 変更不要）

## 機能マトリクス

| 機能 | 現状 | 配置 | App Store 上の位置づけ |
|------|------|------|------------------------|
| 起動画面 | ✅ `LaunchScreen.storyboard` + Splash assets | iOS | 必須 |
| メイン UI | ✅ 本番 WebView `/app/*` | Capacitor | コア体験（段階的にアプリ専用 UI） |
| マイク許可前説明 | ✅ 骨組み | `MicPermissionPrimerViewController` | 審査・UX |
| アプリ設定 | ✅ `/app/settings` | Web（アプリ専用） | 審査でよく見られる |
| ネイティブ ⚙️ | 🔶 ほぼ非表示 | Swift → `/app/settings` | 二重 UI 回避 |
| 利用規約 | ✅ Web リンク | ネイティブ設定 → Safari VC | 必須 |
| プライバシー | ✅ Web リンク | 同上 | 必須 |
| ガイドライン | ✅ Web リンク | 同上 | UGC 向け |
| 通報・ブロック | 🔶 説明 + Web ガイドライン | 実操作は Web ルーム/通話 UI | 審査で説明必要 |
| お問い合わせ | ✅ mailto + About リンク | ネイティブ設定 | 必須 |
| アカウント削除 | 🔶 プライバシー/設定へ誘導 | ネイティブ + Web `/settings` | **登録後に in-app 削除 API が必要** |
| Push (APNs) | 🔶 準備中 UI | `/app/settings` 説明のみ | Developer Program 後に本実装 |
| IAP | ❌ TODO | Web Stripe のまま | **App Store 前に IAP 要否を検討** |

凡例: ✅ 骨組み済み / 🔶 最小導線のみ / ❌ 未着手

## ファイル一覧

| ファイル | 役割 |
|----------|------|
| `RootContainerViewController.swift` | WebView ラッパー、設定ボタン、マイク primer 起動 |
| `MicPermissionPrimerViewController.swift` | マイク使用の事前説明 + `AVAudioSession` 許可 |
| `AppSettingsViewController.swift` | 法務・安全・サポート・アカウント導線 |
| `ClassmateURLs.swift` | 本番 URL 定数 |
| `SafariLinkPresenter.swift` | アプリ内 Safari で Web ページ表示 |

## App Store 審査で不足しがちな項目（今後）

Developer Program 登録後、提出前に埋める想定:

1. **アカウント削除** — App Store Review Guideline 5.1.1(v)。メール受付だけでは不十分な場合あり。API + ネイティブ画面での完結を検討
2. **年齢制限・UGC** — 通報フローの審査用説明文、モデレーション体制の記載
3. **App Privacy Details** — マイク、識別子、利用状況データの申告
4. **スクリーンショット** — iPhone / iPad 各サイズ。ネイティブ設定画面も含めると「殻だけ」印象を減らせる
5. **正式アイコン・スプラッシュ** — `Assets.xcassets` をブランド用に差し替え
6. **オフライン時** — リモート URL 構成ではネット必須。審査用にエラー画面（ネイティブ）を追加検討
7. **Sign in with Apple** — 第三者ログイン（Google）のみの場合、Apple ログイン要件の要否を確認
8. **IAP** — App Store ガイドライン上、Stripe 課金のまま提出できるか要確認。不可なら StoreKit 移行

## Developer Program 登録後の実装順（推奨）

1. 正式 Signing / Bundle ID 確定
2. TestFlight 内部テスト（実機・通話・マイク）
3. **APNs Push** — `ios_push_tokens`、共通イベントの iOS 分岐
4. **Sign in with Apple** — `/app/login` の Apple ボタン有効化
5. アカウント削除フロー（API + アプリ UI）
6. **IAP 要否判断** — Stripe 継続か StoreKit 移行か
7. オフライン / ロード失敗のネイティブ UI
8. App Store Connect メタデータ・プライバシーラベル

## 関連ドキュメント

- [IOS_SETUP.md](./IOS_SETUP.md) — ビルド手順・0 円でできること
- [VERCEL_PROD_DEV.md](./VERCEL_PROD_DEV.md) — Web 本番 / 開発環境
