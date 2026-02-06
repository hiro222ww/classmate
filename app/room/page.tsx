import RoomClient from "./RoomClient";

export default function RoomPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
        待機ルーム
      </h1>
      <RoomClient />
    </main>
  );
}
