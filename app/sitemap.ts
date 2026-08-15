import type { MetadataRoute } from "next";

/** Canonical production origin for Google Search Console. */
const SITE_ORIGIN = "https://classmate-room.com";

/**
 * Public marketing / legal pages only.
 * Excludes /admin, /api, /app, auth flows, call/room, billing, and user-specific surfaces.
 */
const PUBLIC_PATHS: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/about", changeFrequency: "monthly", priority: 0.8 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.5 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.5 },
  { path: "/guidelines", changeFrequency: "yearly", priority: 0.5 },
  {
    path: "/legal/commercial-disclosure",
    changeFrequency: "yearly",
    priority: 0.4,
  },
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
