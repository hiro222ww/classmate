import type { Metadata } from "next";
import { Suspense } from "react";
import AppLifecycleBoot from "@/components/AppLifecycleBoot";
import AuthBoot from "@/components/AuthBoot";
import { AuthProvider } from "@/components/AuthProvider";
import CapacitorAuthReturnBoot from "@/components/CapacitorAuthReturnBoot";
import AppShellContextBoot from "@/components/AppShellContextBoot";
import OAuthRootCodeRedirectBoot from "@/components/OAuthRootCodeRedirectBoot";
import AppAccountNav from "@/components/AppAccountNav";
import SiteFooter from "@/components/SiteFooter";
import LineInAppBrowserGate from "@/components/LineInAppBrowserGate";
import PageVisitTracker from "@/components/PageVisitTracker";
import { buildHomeMetadata } from "@/lib/seo";
import "./globals.css";

export const metadata: Metadata = {
  ...buildHomeMetadata(),
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32 48x48", type: "image/x-icon" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
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
          background: "var(--cm-page-bg, #fff)",
          color: "var(--cm-text, #111)",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, 'Noto Sans JP', sans-serif",
        }}
      >
        <LineInAppBrowserGate>
          <AuthProvider>
            <AppLifecycleBoot />
            <OAuthRootCodeRedirectBoot />
            <CapacitorAuthReturnBoot />
            <AppShellContextBoot />
            <AuthBoot />
            <Suspense fallback={null}>
              <PageVisitTracker />
            </Suspense>
            <Suspense fallback={null}>
              <AppAccountNav />
            </Suspense>
            {/* ▼ メインコンテンツ */}
            <div style={{ minHeight: "100vh" }}>{children}</div>

            <SiteFooter />
          </AuthProvider>
        </LineInAppBrowserGate>
      </body>
    </html>
  );
}
