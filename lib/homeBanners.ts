/**
 * Home promo / atmosphere banners.
 * Designed for future carousel, campaigns, and ads without a CMS yet.
 */

export type HomeBannerKind =
  | "atmosphere"
  | "campaign"
  | "collab"
  | "ad"
  | "seasonal";

export type HomeBannerOverlayTone = "light" | "dark";

export type HomeBanner = {
  id: string;
  /** Public image URL (e.g. /brand/...). */
  imageSrc: string;
  /** Optional alt for decorative/campaign art; empty when purely decorative. */
  imageAlt?: string;
  /** Catchphrase overlaid on the photo. */
  headline?: string | null;
  /** Optional secondary line (kept off-canvas for atmosphere; usable for ads). */
  subheadline?: string | null;
  /** Optional click-through. */
  href?: string | null;
  kind: HomeBannerKind;
  /** Lower sorts first. */
  sortOrder: number;
  /** ISO strings; omit for always-on. */
  startsAt?: string | null;
  endsAt?: string | null;
  /** When kind is "ad", UI may show an 広告 mark. */
  sponsoredLabel?: string | null;
  /**
   * Chrome / catchphrase contrast against the photo.
   * light = white text (dark sky); dark = ink text (bright sky).
   */
  overlayTone?: HomeBannerOverlayTone;
  /** Optional CSS color override for headline. */
  headlineColor?: string | null;
};

/** Current sunset hero — sole default until more assets ship. */
export const DEFAULT_HOME_BANNERS: HomeBanner[] = [
  {
    id: "atmosphere-sunset-default",
    imageSrc: "/brand/classmate-home-hero.jpg",
    imageAlt: "",
    headline: "人との出会いで景色が変わる",
    subheadline: null,
    href: null,
    kind: "atmosphere",
    sortOrder: 10,
    startsAt: null,
    endsAt: null,
    // Sky is bright; keep logo/actions dark and headline light over the grass.
    overlayTone: "dark",
    headlineColor: "#ffffff",
  },
];

function parseTime(value?: string | null): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

/** Filter by schedule and sort for display. */
export function resolveActiveHomeBanners(
  banners: HomeBanner[],
  nowMs: number = Date.now()
): HomeBanner[] {
  return banners
    .filter((b) => {
      const start = parseTime(b.startsAt);
      const end = parseTime(b.endsAt);
      if (start != null && nowMs < start) return false;
      if (end != null && nowMs >= end) return false;
      return Boolean(b.imageSrc);
    })
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}
