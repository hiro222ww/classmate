import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/seo";

/**
 * Public marketing / legal pages only.
 * Home is priority 1 so it stays the representative URL in Search Console.
 */
const PUBLIC_PATHS: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/about", changeFrequency: "monthly", priority: 0.7 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/guidelines", changeFrequency: "yearly", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return PUBLIC_PATHS.map(({ path, changeFrequency, priority }) => ({
    url: path === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
