import ProfileClient from "./ProfileClient";

export default function ProfilePage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
        プロフィール登録
      </h1>
      <p style={{ marginTop: 0, opacity: 0.7, fontSize: 13 }}>
  現在は18歳以上の方のみご利用いただけます。
</p>

      <ProfileClient />
    </main>
  );
}
