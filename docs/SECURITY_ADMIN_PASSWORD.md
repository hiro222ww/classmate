# 管理者パスワードの扱い（セキュリティ）

## 仕組み
- **本番の管理者認証**: サーバー側 `ADMIN_PASSWORD` のみ。`POST /api/admin/login` が HMAC Cookie `classmate_admin`（httpOnly）を発行。
- **管理API / `/admin/*`**: Next.js 16 `proxy.ts` と各 route の `requireAdmin` が Cookie を検証。
- **DEV UI**（`NEXT_PUBLIC_DEV_MODE=true` 時のみ表示）: 解除も `/api/admin/login` を呼び、クライアントにパスワードを埋め込まない。

## 廃止
- `NEXT_PUBLIC_ADMIN_PASSWORD` は**使用禁止**。Next がクライアントバンドルに埋め込むため、本番で設定すると管理者パスワード相当が公開される。

## 確認済み（本番）
- 2026-11-20: `classmate-room.com` のクライアント JS に、旧 `unlockAdmin` 経由で
  `NEXT_PUBLIC_ADMIN_PASSWORD` の**平文値がインライン**されていることを確認。
- 管理 API 自体は httpOnly Cookie + サーバー側 `ADMIN_PASSWORD` だが、
  DEV UI 解除用の平文が公開バンドルに載っている状態は即時是正対象。

## 運営者対応（承認後・優先）
1. 本 PR（コード修正）を `main` にマージして本番デプロイ
2. Vercel Production / Preview から `NEXT_PUBLIC_ADMIN_PASSWORD` を削除
3. `ADMIN_PASSWORD` を**必ずローテーション**（公開バンドルに載った値と同一だった可能性が高い）
4. 旧バンドルが CDN に残る場合があるため、デプロイ後にクライアント JS を再スキャンして平文が消えたことを確認
5. `ADMIN_PASSWORD` はサーバー専用のまま維持
