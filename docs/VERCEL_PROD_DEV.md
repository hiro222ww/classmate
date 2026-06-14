# Vercel 本番 / 開発 分離メモ

最終更新: 2026-06-13

## 安定版（Git）

| 項目 | 値 |
|------|-----|
| 安定 commit | `cff4fcbb8da597098a481e76511afdd354e24730` (`cff4fcb`) |
| タグ | `good-voice-4devices-peer-health-stable` |
| branch | `good/voice-4devices-peer-health-stable` |
| 本番追従 branch | `main`（上記と同一） |
| 開発 branch | `develop`（現時点は `main` と同一。以降の実験は `develop` へ） |

以前の安定版（削除しない）:

- タグ: `good-voice-4devices-stable-quiet-logs` → `d1f1d67`
- branch: `good/voice-4devices-stable-quiet-logs` → `d0ed246`

---

## 目標構成

| Vercel Project | 用途 | Production Branch | デプロイ元 |
|----------------|------|-------------------|----------|
| **classmate**（新規） | 本番 / 公開 | `main` | `main` の push |
| **classmate-8inw**（既存） | 開発 / 検証 | `develop`（切替後） | `develop` の push |

**重要:** 先に `classmate` 本番が動作確認できるまで、`classmate-8inw` の Production Branch は切り替えない。

---

## 推奨 URL（ダッシュボードで実 URL を確認）

| 環境 | Project | 想定 URL |
|------|---------|----------|
| 本番 | `classmate` | `https://classmate.vercel.app` または付与された Production Domain |
| 開発 | `classmate-8inw` | `https://classmate-8inw.vercel.app`（現状の検証 URL） |

カスタムドメインがある場合は本番 `classmate` にのみ割り当て、開発は `*.vercel.app` のままにする。

---

## 手順 A: 本番 project `classmate` を新規作成

1. [Vercel Dashboard](https://vercel.com) → **Add New… → Project**
2. GitHub repo **`hiro222ww/classmate`** を Import
3. Project Name: **`classmate`**
4. Framework: Next.js（自動検出）
5. **まだ Deploy しない** → 先に Environment Variables を設定
6. `classmate-8inw` の **Production** 環境変数をコピー（下記チェックリスト参照）
7. 本番用に次だけ差し替え:
   - `NEXT_PUBLIC_APP_URL` → 本番 URL（例: `https://classmate.vercel.app`）
   - `NEXT_PUBLIC_APP_ORIGIN` → 同上（設定している場合）
8. **Deploy**（`main` ブランチ）
9. デプロイ後スモークテスト:
   - `/api/debug/health` が 200
   - `/api/ping-supabase` が成功
   - `/api/push/vapid-public-key`（Push 利用時）
   - `/api/turn`（TURN 利用時）
   - 4 台通話（`audio_confirmed_strict` → 通話中）
10. 問題なければ本番 URL をチームに共有

### Production Branch 設定（classmate）

**Settings → Git → Production Branch** = `main`

Preview Deployments は任意（PR ごとの preview は残してよい）。

---

## 手順 B: 既存 `classmate-8inw` を開発用に切替（本番確認後）

1. `classmate` 本番が安定していることを確認
2. **classmate-8inw** → **Settings → Git**
3. **Production Branch** を `main` → **`develop`** に変更
4. `develop` を redeploy（または空 commit push）
5. 開発 URL（`classmate-8inw.vercel.app`）で動作確認
6. 以降の実験は `develop` に push:

```bash
git checkout develop
# 変更 …
git push origin develop
```

本番反映は `main` へ merge のみ:

```bash
git checkout main
git merge develop   # 十分テスト後
git push origin main
```

---

## 環境変数コピー手順（classmate-8inw → classmate）

Vercel Dashboard:

1. **classmate-8inw** → Settings → Environment Variables
2. **Production** タブの一覧をエクスポートまたは手動コピー
3. **classmate** → Settings → Environment Variables → 同じキーを **Production** に追加

CLI を使う場合（ローカルに Vercel CLI + ログイン済み）:

```bash
# 参考（project 名はダッシュボードと一致させる）
vercel env pull .env.vercel.8inw --environment=production --yes
# classmate 側へは Dashboard で Import / 手動貼り付けが安全
```

---

## 必須環境変数チェックリスト

コードベースから抽出。**本番・開発とも同じ値でよいもの**と**URL だけ変えるもの**を分けた。

### 必須（本番・開発で同一値を推奨）

#### Supabase

- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_URL`（server 用。anon URL と同じで可）
- [ ] `SUPABASE_SERVICE_ROLE_KEY`

#### Stripe

- [ ] `STRIPE_SECRET_KEY`
- [ ] `STRIPE_WEBHOOK_SECRET`
- [ ] `STRIPE_PRICE_SLOTS_3`
- [ ] `STRIPE_PRICE_SLOTS_5`
- [ ] `STRIPE_PRICE_TOPIC_400`
- [ ] `STRIPE_PRICE_TOPIC_800`
- [ ] `STRIPE_PRICE_TOPIC_1200`
- [ ] `STRIPE_PORTAL_CONFIG_THEME`
- [ ] `STRIPE_PORTAL_CONFIG_SLOTS`

#### TURN（音声通話）

- [ ] `TURN_PROVIDER`（例: `static`）
- [ ] `STATIC_TURN_URLS`
- [ ] `STATIC_TURN_USERNAME`
- [ ] `STATIC_TURN_CREDENTIAL`

`TURN_PROVIDER=twilio` の場合は代わりに:

- [ ] `TWILIO_ACCOUNT_SID`
- [ ] `TWILIO_API_KEY`
- [ ] `TWILIO_API_SECRET`

#### Web Push

- [ ] `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- [ ] `VAPID_PRIVATE_KEY`
- [ ] `VAPID_SUBJECT`（例: `mailto:support@classmate.app`）

#### 管理 / 認証

- [ ] `ADMIN_PASSWORD`（server / cookie 署名）
- [ ] `NEXT_PUBLIC_ADMIN_PASSWORD`（dev UI 用。本番では未設定 or 別値も可）

### プロジェクトごとに変える（漏れ注意）

- [ ] `NEXT_PUBLIC_APP_URL` — **各 Vercel project の Production URL**
- [ ] `NEXT_PUBLIC_APP_ORIGIN` — 同上（Push deep link 等で使用）

### Stripe Webhook（2 project 運用時）

本番 `classmate` と開発 `classmate-8inw` で **別 endpoint** になるため:

- Stripe Dashboard で Webhook を 2 本用意するか、開発は本番 webhook のみにする
- 開発用に別 `STRIPE_WEBHOOK_SECRET` を使う場合は **classmate-8inw だけ**差し替え
- 同一 Stripe テスト環境を共有するなら `STRIPE_SECRET_KEY` / `STRIPE_PRICE_*` は同一でよい

### 任意（機能ごと）

- [ ] `YOUTUBE_API_KEY` — YouTube 検索
- [ ] `RECRUITMENT_SESSION_TTL_MINUTES` — 募集 TTL
- [ ] `ADMIN_PASSCODE` — 旧 admin classes API
- [ ] `NEXT_PUBLIC_DEV_MODE` — 開発 UI（**本番 `classmate` では `false` または未設定推奨**）
- [ ] `NEXT_PUBLIC_DEBUG_VOICE` / `DEBUG_VOICE` — 音声デバッグ（本番 OFF 推奨）
- [ ] `NEXT_PUBLIC_DEBUG_LOGS` — 詳細ログ（本番 OFF 推奨）

---

## 本番 vs 開発 推奨差分

| 変数 | classmate（本番） | classmate-8inw（開発） |
|------|-------------------|------------------------|
| Production Branch | `main` | `develop` |
| `NEXT_PUBLIC_APP_URL` | 本番 URL | `https://classmate-8inw.vercel.app` |
| `NEXT_PUBLIC_APP_ORIGIN` | 本番 URL | 開発 URL |
| `NEXT_PUBLIC_DEV_MODE` | 未設定 / `false` | `true` 可 |
| `NEXT_PUBLIC_DEBUG_*` | 未設定 | 必要時のみ ON |
| Supabase / TURN / Stripe keys | 同一（テスト環境共有時） | 同一 |
| `STRIPE_WEBHOOK_SECRET` | 本番 endpoint 用 | 開発 endpoint 用（分ける場合） |

---

## コピー後の確認コマンド

```bash
# 本番
curl -sS https://<classmate-production-domain>/api/debug/health | jq .

# 開発
curl -sS https://classmate-8inw.vercel.app/api/debug/health | jq .
```

期待: `environment: "production"`, Supabase 接続 OK。

音声:

```bash
npm run test:turn-provider -- --api-base https://<本番URL>
npm run test:turn-provider -- --api-base https://classmate-8inw.vercel.app
```

---

## 運用ルール（短く）

- **本番 URL** → ユーザー配布・Stripe 本番 webhook・Push の origin
- **開発 URL** → 4 台実機テスト・実験的修正の先行検証
- 安定版に戻す: `git checkout good-voice-4devices-peer-health-stable`
- 本番を安定版に固定したいとき: `main` が `cff4fcb` であることを確認してから `classmate` を deploy

---

## 今回実施済み（Git）

```bash
git branch --show-current   # main
git status                  # clean
git log -1 --oneline        # cff4fcb update
git tag -l good-voice-4devices-peer-health-stable
git branch -a | grep develop
# develop created from main and pushed to origin
```
