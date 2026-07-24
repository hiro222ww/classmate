import Link from "next/link";

type Props = {
  searchParams?: Promise<{ status?: string }> | { status?: string };
};

export default async function EmailUnsubscribedPage({ searchParams }: Props) {
  const params = await Promise.resolve(searchParams ?? {});
  const status = String(params.status ?? "ok");

  const message =
    status === "already"
      ? "メール通知はすでに停止されています。"
      : status === "invalid"
        ? "リンクが無効か期限切れです。設定画面から停止することもできます。"
        : "メール通知を停止しました。";

  return (
    <main
      style={{
        maxWidth: 520,
        margin: "48px auto",
        padding: 24,
        display: "grid",
        gap: 16,
      }}
    >
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>メール通知</h1>
      <p style={{ margin: 0, lineHeight: 1.7, color: "#374151" }}>{message}</p>
      <p style={{ margin: 0, fontSize: 14 }}>
        <Link href="/settings">設定へ戻る</Link>
        {" · "}
        <Link href="/">ホーム</Link>
      </p>
    </main>
  );
}
