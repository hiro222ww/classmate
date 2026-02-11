// app/call/page.tsx
import CallClient from "./CallClient";

export default function CallPage() {
  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
        通話セッション
      </h1>
      <CallClient />
    </main>
  );
}
