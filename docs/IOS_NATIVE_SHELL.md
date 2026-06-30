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
│  │  → https://classmate-room.com │  │
│  │    （既存 Web UI・そのまま）    │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
         │ 初回起動
         ▼
┌─────────────────────────┐
│ MicPermissionPrimer      │  ← システム許可の前説明
└─────────────────────────┘
         │ ⚙️ タップ
         ▼
┌─────────────────────────┐
│ AppSettingsViewController│  ← 法務・安全・問い合わせ・アカウント
└─────────────────────────┘
```

### なぜ Web に専用 route を足さないか

- 通常 Web 導線から見える `/app-only/...` は、URL 共有・SEO・既存ユーザー体験に影響しうる
- App Store 審査で「ネイティブ機能」として見せるには **Swift 側の画面** の方が明確
- 法務文書は Web に既にある（`/terms`, `/privacy`, `/guidelines`）→ **SFSafariViewController で参照** し、二重管理を避ける

### Web 専用 route を使う場合の将来案（今回は未採用）

`?native=1` や `X-Classmate-Client: ios` ヘッダー付きの非公開 route は、ネイティブからだけ開く選択肢として残せる。現状は不要。

## ⚙️ 表示制御（iOS のみ・Web 変更なし）

| ファイル | 役割 |
|----------|------|
| `SettingsGearVisibilityPolicy.swift` | WebView の `url.path` から ⚙️ 表示可否を判定 |
| `SettingsGearLayout` | 位置定数（`topInset` / `trailingInset` / `size`）。制約を変えるだけで移動可能 |

- **現状**: `/call`・`/room`（クエリ付き含む）では ⚙️ を非表示
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
| メイン UI | ✅ 本番 WebView | Capacitor | コア体験 |
| マイク許可前説明 | ✅ 骨組み | `MicPermissionPrimerViewController` | 審査・UX |
| 設定画面 | ✅ 骨組み | `AppSettingsViewController` | 審査でよく見られる |
| 利用規約 | ✅ Web リンク | ネイティブ設定 → Safari VC | 必須 |
| プライバシー | ✅ Web リンク | 同上 | 必須 |
| ガイドライン | ✅ Web リンク | 同上 | UGC 向け |
| 通報・ブロック | 🔶 説明 + Web ガイドライン | 実操作は Web ルーム/通話 UI | 審査で説明必要 |
| お問い合わせ | ✅ mailto + About リンク | ネイティブ設定 | 必須 |
| アカウント削除 | 🔶 プライバシー/設定へ誘導 | ネイティブ + Web `/settings` | **登録後に in-app 削除 API が必要** |
| Push (APNs) | ❌ 後回し | — | Developer Program 後 |
| IAP | ❌ 後回し | Web Stripe のまま | 別途 |

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

## Developer Program 登録後の実装順（推奨）

1. 正式 Signing / Bundle ID 確定
2. TestFlight 内部テスト（実機・通話・マイク）
3. アカウント削除フロー（API + ネイティブ UI）
4. オフライン / ロード失敗のネイティブ UI
5. App Store Connect メタデータ・プライバシーラベル
6. 必要なら Web バンドル同梱（`server.url` 解除）へ段階移行
7. APNs / IAP はプロダクト判断後

## 関連ドキュメント

- [IOS_SETUP.md](./IOS_SETUP.md) — ビルド手順・0 円でできること
- [VERCEL_PROD_DEV.md](./VERCEL_PROD_DEV.md) — Web 本番 / 開発環境
