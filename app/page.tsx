import type { Metadata } from "next";
import { Suspense } from "react";
import HomeClient from "./HomeClient";
import { ClientErrorBoundary } from "@/components/ClientErrorBoundary";
import { HomeBrandVisual } from "@/components/brand/HomeBrandVisual";
import {
  buildHomeMetadata,
  buildOrganizationJsonLd,
  buildWebApplicationJsonLd,
  buildWebsiteJsonLd,
} from "@/lib/seo";

export const metadata: Metadata = buildHomeMetadata();

export default function HomePage() {
  const organizationLd = buildOrganizationJsonLd();
  const websiteLd = buildWebsiteJsonLd();
  const appLd = buildWebApplicationJsonLd();

  return (
    <main
      className="cm-classroom-scope"
      style={{ padding: "28px 20px", maxWidth: 960, margin: "0 auto" }}
    >
      <HomeBrandVisual />

      <ClientErrorBoundary label="home">
        <Suspense fallback={<p style={{ margin: 0 }}>読み込み中...</p>}>
          <HomeClient />
        </Suspense>
      </ClientErrorBoundary>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd) }}
      />
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
