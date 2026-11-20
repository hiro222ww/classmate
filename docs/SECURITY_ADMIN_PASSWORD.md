# 管理者パスワードの扱い（セキュリティ）

## 仕組み
- **本番の管理者認証**: サーバー側 `ADMIN_PASSWORD` のみ。`POST /api/admin/login` が HMAC Cookie `classmate_admin`（httpOnly）を発行。
- **管理API / `/admin/*`**: Next.js 16 `proxy.ts` と各 route の `requireAdmin` が Cookie を検証。
- **DEV UI**（`NEXT_PUBLIC_DEV_MODE=true` 時のみ表示）: 解除も `/api/admin/login` を呼び、クライアントにパスワードを埋め込まない。

## 廃止
- `NEXT_PUBLIC_ADMIN_PASSWORD` は**使用禁止**。Next がクライアントバンドルに埋め込むため、本番で設定すると管理者パスワード相当が公開される。

## 運営者対応（承認後）
1. Vercel Production / Preview から `NEXT_PUBLIC_ADMIN_PASSWORD` を削除
2. 過去に `ADMIN_PASSWORD` と同じ値を入れていた場合は `ADMIN_PASSWORD` をローテーション
3. `ADMIN_PASSWORD` はサーバー専用のまま維持
