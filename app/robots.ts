import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/seo";

/**
 * Disallow only surfaces that should not be crawled at all.
 * App / account / legal-adjacent pages that use `robots: noindex` must remain
 * crawlable so Googlebot can see the noindex directive.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/", "/dev/"],
      },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  };
}
