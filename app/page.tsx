import type { Metadata } from "next";
import { Suspense } from "react";
import HomeClient from "./HomeClient";
import { ClientErrorBoundary } from "@/components/ClientErrorBoundary";
import {
  HOME_H1,
  HOME_INTRO,
  buildHomeMetadata,
  buildWebApplicationJsonLd,
  buildWebsiteJsonLd,
} from "@/lib/seo";

export const metadata: Metadata = buildHomeMetadata();

export default function HomePage() {
  const websiteLd = buildWebsiteJsonLd();
  const appLd = buildWebApplicationJsonLd();

  return (
    <main
      className="cm-classroom-scope"
      style={{ padding: "28px 20px", maxWidth: 960, margin: "0 auto" }}
    >
      <header
        className="cm-seo-home-intro"
        style={{
          marginBottom: 20,
          display: "grid",
          gap: 8,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: "var(--cm-text, #111827)",
            lineHeight: 1.25,
          }}
        >
          {HOME_H1}
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: 15,
            lineHeight: 1.7,
            color: "var(--cm-muted, #4b5563)",
            maxWidth: "40rem",
          }}
        >
          {HOME_INTRO}
        </p>
      </header>

      <ClientErrorBoundary label="home">
        <Suspense fallback={<p style={{ margin: 0 }}>読み込み中...</p>}>
          <HomeClient />
        </Suspense>
      </ClientErrorBoundary>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(appLd) }}
      />
    </main>
  );
}
