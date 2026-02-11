// app/room/page.tsx
import RoomClient from "./RoomClient";

export default function RoomPage() {
  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
      <RoomClient />
    </main>
  );
}
