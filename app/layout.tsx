import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "classmate",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        {children}

        <footer
          style={{
            marginTop: 40,
            padding: 20,
            textAlign: "center",
            fontSize: 12,
            color: "#666",
            borderTop: "1px solid #e5e7eb",
          }}
        >
          <nav
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <Link href="/about">サービスについて</Link>
            <Link href="/terms">利用規約</Link>
            <Link href="/about">返金ポリシー</Link>
            <a href="mailto:classmate.app.team@gmail.com">お問い合わせ</a>
          </nav>
        </footer>
      </body>
    </html>
  );
}