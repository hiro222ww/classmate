// app/topics/page.tsx
export const dynamic = "force-dynamic";

type Topic = {
  topic_key: string;
  title: string;
  description: string | null;
  is_sensitive: boolean;
  min_age: number;
  monthly_price: number;
};

async function getTopics(): Promise<Topic[]> {
  try {
    const res = await fetch("http://localhost:3000/api/topics", { cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json().catch(() => null);
    const topics = Array.isArray(json?.topics) ? json.topics : [];
    return topics as Topic[];
  } catch {
    return [];
  }
}

// “危険なデコード”をしない・表示用に安全化する
function safeText(v: unknown) {
  if (typeof v !== "string") return "";
  // ここで decodeURIComponent は絶対しない（%混入でクラッシュする）
  // 表示に困る制御文字だけ落とす
  return v.replace(/[\u0000-\u001F\u007F]/g, "");
}

export default async function TopicsPage() {
  const topics = await getTopics();

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>テーマ</h1>

      {topics.length === 0 ? (
        <div style={{ padding: 12, border: "1px solid rgba(0,0,0,0.15)", borderRadius: 12 }}>
          テーマがありません（または読み込みに失敗しました）
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {topics.map((t) => (
            <div
              key={t.topic_key}
              style={{
                padding: 12,
                border: "1px solid rgba(0,0,0,0.15)",
                borderRadius: 12,
              }}
            >
              <div style={{ fontWeight: 800 }}>
                {safeText(t.title) || "(no title)"}
              </div>

              {t.description ? (
                <div style={{ opacity: 0.85, marginTop: 6 }}>{safeText(t.description)}</div>
              ) : null}

              <div style={{ opacity: 0.7, marginTop: 10, fontSize: 13 }}>
                key: {t.topic_key} / price: {t.monthly_price} / min_age: {t.min_age} / sensitive:{" "}
                {String(t.is_sensitive)}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
