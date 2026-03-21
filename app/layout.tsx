import "./globals.css";

export const metadata = {
  title: "classmate",
  description: "無作為に選ばれた人たちと、同じ時間を過ごすための場所。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        {children}

        {/* フッター（Stripe審査用） */}
        <footer
          style={{
            marginTop: 40,
            padding: 20,
            textAlign: "center",
            fontSize: 12,
            color: "#666",
          }}
        >
          <a href="/about" style={{ marginRight: 16 }}>
            サービスについて
          </a>
          <a href="/about">運営情報</a>
        </footer>
      </body>
    </html>
  );
}