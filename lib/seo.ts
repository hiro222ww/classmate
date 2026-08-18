import type { Metadata } from "next";

/** Canonical production origin for SEO / Search Console. */
export const SITE_ORIGIN = "https://classmate-room.com";

export const SITE_NAME = "Classmate";

export const HOME_TITLE =
  "Classmate｜同年代と気軽に話せる音声コミュニティ";

/** ~120–160 chars: 同年代 / 音声通話 / 友達づくり */
export const HOME_DESCRIPTION =
  "Classmate（クラスメイト）は、同年代と気軽に話せる音声通話コミュニティです。テーマ別の少人数クラスで友だちづくりができ、大人になっても自然に仲間とつながれます。通話アプリをお探しの方にも、安心してご利用いただける場を目指しています。";

export const HOME_H1 = "Classmate";

/** Visible home intro near the brand logo (通話 for search intent). */
export const HOME_INTRO =
  "Classmate（クラスメイト）は、同年代と気軽に通話できる音声コミュニティです。";

/** Wide brand logo used as the representative Classmate image. */
export const BRAND_LOGO_PATH = "/brand/classmate-logo.png";
export const BRAND_LOGO_URL = `${SITE_ORIGIN}${BRAND_LOGO_PATH}`;
export const BRAND_LOGO_WIDTH = 1024;
export const BRAND_LOGO_HEIGHT = 341;
export const BRAND_LOGO_ALT =
  "Classmate（クラスメイト）のロゴ。同年代と気軽に通話できる音声コミュニティ";

export function buildHomeMetadata(): Metadata {
  return {
    title: {
      default: HOME_TITLE,
      template: `%s｜${SITE_NAME}`,
    },
    description: HOME_DESCRIPTION,
    applicationName: SITE_NAME,
    metadataBase: new URL(SITE_ORIGIN),
    alternates: {
      canonical: "/",
    },
    openGraph: {
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      url: `${SITE_ORIGIN}/`,
      siteName: SITE_NAME,
      locale: "ja_JP",
      type: "website",
      images: [
        {
          url: BRAND_LOGO_URL,
          width: BRAND_LOGO_WIDTH,
          height: BRAND_LOGO_HEIGHT,
          alt: BRAND_LOGO_ALT,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      images: [BRAND_LOGO_URL],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export function buildPublicPageMetadata(params: {
  title: string;
  description: string;
  path: string;
  /**
   * Legal / secondary pages: still indexable, but title is page-first
   * (e.g. プライバシーポリシー｜Classmate) so home remains the product brand URL.
   */
  secondary?: boolean;
}): Metadata {
  void params.secondary;
  const url = `${SITE_ORIGIN}${params.path}`;
  const fullTitle = `${params.title}｜${SITE_NAME}`;
  return {
    title: params.title,
    description: params.description,
    alternates: {
      canonical: params.path,
    },
    openGraph: {
      title: fullTitle,
      description: params.description,
      url,
      siteName: SITE_NAME,
      locale: "ja_JP",
      type: "website",
      images: [
        {
          url: BRAND_LOGO_URL,
          width: BRAND_LOGO_WIDTH,
          height: BRAND_LOGO_HEIGHT,
          alt: BRAND_LOGO_ALT,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: params.description,
      images: [BRAND_LOGO_URL],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

/** App / private surfaces: do not compete in search. */
export const NOINDEX_ROBOTS: Metadata["robots"] = {
  index: false,
  follow: false,
  googleBot: {
    index: false,
    follow: false,
  },
};

export function buildOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    alternateName: ["Classmate（クラスメイト）", "classmate", "クラスメイト"],
    url: `${SITE_ORIGIN}/`,
    logo: BRAND_LOGO_URL,
    image: BRAND_LOGO_URL,
    description: HOME_DESCRIPTION,
  };
}

export function buildWebsiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: ["Classmate（クラスメイト）", "classmate", "クラスメイト"],
    url: `${SITE_ORIGIN}/`,
    description: HOME_DESCRIPTION,
    inLanguage: "ja-JP",
    image: BRAND_LOGO_URL,
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: {
        "@type": "ImageObject",
        url: BRAND_LOGO_URL,
        width: BRAND_LOGO_WIDTH,
        height: BRAND_LOGO_HEIGHT,
      },
    },
  };
}

export function buildWebApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    url: `${SITE_ORIGIN}/`,
    applicationCategory: "SocialNetworkingApplication",
    operatingSystem: "Web",
    description: HOME_DESCRIPTION,
    inLanguage: "ja-JP",
    image: BRAND_LOGO_URL,
    logo: BRAND_LOGO_URL,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "JPY",
    },
  };
}
