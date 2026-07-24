import type { Metadata } from "next";
import { Suspense } from "react";
import AppLifecycleBoot from "@/components/AppLifecycleBoot";
import AuthBoot from "@/components/AuthBoot";
import CapacitorAuthReturnBoot from "@/components/CapacitorAuthReturnBoot";
import AppShellContextBoot from "@/components/AppShellContextBoot";
import OAuthRootCodeRedirectBoot from "@/components/OAuthRootCodeRedirectBoot";
import AppAccountNav from "@/components/AppAccountNav";
import SiteFooter from "@/components/SiteFooter";
import LineInAppBrowserGate from "@/components/LineInAppBrowserGate";
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
        <LineInAppBrowserGate>
          <AppLifecycleBoot />
          <OAuthRootCodeRedirectBoot />
          <CapacitorAuthReturnBoot />
          <AppShellContextBoot />
          <AuthBoot />
          <Suspense fallback={null}>
            <AppAccountNav />
          </Suspense>
          {/* ▼ メインコンテンツ */}
          <div style={{ minHeight: "100vh" }}>{children}</div>

          <SiteFooter />
        </LineInAppBrowserGate>
      </body>
    </html>
  );
}
