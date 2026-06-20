import type { Metadata } from "next";
import Link from "next/link";
import AppLifecycleBoot from "@/components/AppLifecycleBoot";
import { resolveAppOrigin } from "@/lib/appOrigin";
import "./globals.css";

const appOrigin = resolveAppOrigin();

export const metadata: Metadata = {
  metadataBase: new URL(appOrigin),
  title: "classmate",
  description: "大人になっても自然と仲間ができる場所",
  manifest: "/manifest.webmanifest",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "classmate",
    description: "大人になっても自然と仲間ができる場所",
    url: appOrigin,
    siteName: "classmate",
    locale: "ja_JP",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body
        style={{
          margin: 0,
          background: "#fff",
          color: "#111",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <AppLifecycleBoot />
        {/* ▼ メインコンテンツ */}
        <div style={{ minHeight: "100vh" }}>{children}</div>

        {/* ▼ フッター（控えめ・Stripe対策OK） */}
        <footer
          style={{
            padding: "24px 16px",
            borderTop: "1px solid #e5e7eb",
            fontSize: 12,
            color: "#6b7280",
            textAlign: "center",
            background: "#fff",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 16,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Link href="/about">About</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/guidelines">Guidelines</Link>
            <Link href="/legal/commercial-disclosure">
              Legal
            </Link>
          </div>

          <div style={{ marginTop: 8 }}>
            © {new Date().getFullYear()} classmate
          </div>
        </footer>
      </body>
    </html>
  );
}