"use client";

import Link from "next/link";
import { HOME_INTRO } from "@/lib/seo";

type Props = {
  menuButton?: React.ReactNode;
};

/** Header mark without the black rim baked into apple-touch-icon. */
const BRAND_MARK_SRC = "/brand/classmate-mark.png";

const brandMarkStyle = (size: number): React.CSSProperties => ({
  width: size,
  height: size,
  borderRadius: "50%",
  border: "1px solid rgba(255,255,255,0.85)",
  boxShadow: "0 2px 8px rgba(15,23,42,0.08)",
  flexShrink: 0,
  display: "block",
  background: "transparent",
  objectFit: "cover",
});

const wordmarkStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
  color: "#1e3a5f",
  letterSpacing: 0.3,
  lineHeight: 1.1,
};

const subtitleStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "#64748b",
  letterSpacing: "0.04em",
  marginTop: 1,
};

function BrandWordmark() {
  return (
    <div style={{ minWidth: 0 }}>
      <span style={wordmarkStyle}>Classmate</span>
      <span style={subtitleStyle}>クラスメイト</span>
    </div>
  );
}

/**
 * First-view brand header for the home page.
 * Character mark + "Classmate" wordmark (home link) + optional ☰.
 */
export function HomeBrandVisual({ menuButton }: Props) {
  const hasMenu = Boolean(menuButton);
  const markSize = hasMenu ? 56 : 52;

  return (
    <div
      className="cm-home-brand-visual cm-stagger-1"
      style={{
        display: "grid",
        gap: 8,
        minWidth: 0,
        maxWidth: "100%",
        padding: "14px 16px 12px",
        borderRadius: 22,
        background:
          "linear-gradient(180deg, rgba(238,246,255,0.92) 0%, rgba(204,251,241,0.55) 100%)",
      }}
    >
      {hasMenu ? (
        <>
          <style>{`
            .cm-home-brand-visual-grid {
              display: grid;
              grid-template-columns: 1fr auto;
              grid-template-areas:
                "brand menu"
                "intro intro";
              gap: 8px;
              align-items: center;
              min-width: 0;
            }

            .cm-home-brand-visual-grid-brand {
              grid-area: brand;
              display: inline-flex;
              align-items: center;
              gap: 10px;
              min-width: 0;
              text-decoration: none;
              color: inherit;
            }

            .cm-home-brand-visual-grid-brand:focus-visible {
              outline: 2px solid #0ea5e9;
              outline-offset: 3px;
              border-radius: 12px;
            }

            .cm-home-brand-visual-grid-menu {
              grid-area: menu;
              display: flex;
              justify-content: flex-end;
              align-items: center;
            }

            .cm-home-brand-visual-grid-divider {
              display: none;
            }

            .cm-home-brand-visual-grid-intro {
              grid-area: intro;
            }

            @media (min-width: 768px) {
              .cm-home-brand-visual-grid {
                grid-template-columns: auto 1px 1fr auto;
                grid-template-areas: "brand divider intro menu";
                gap: 12px;
              }

              .cm-home-brand-visual-grid-divider {
                grid-area: divider;
                display: block;
                width: 1px;
                height: 42px;
                background: rgba(15, 23, 42, 0.15);
                justify-self: center;
              }
            }
          `}</style>

          <div className="cm-home-brand-visual-grid">
            <Link
              href="/"
              className="cm-home-brand-visual-grid-brand"
              aria-label="Classmateホーム"
            >
              <img
                src={BRAND_MARK_SRC}
                alt=""
                width={markSize}
                height={markSize}
                decoding="async"
                fetchPriority="high"
                aria-hidden
                style={brandMarkStyle(markSize)}
              />
              <BrandWordmark />
            </Link>

            <div className="cm-home-brand-visual-grid-divider" aria-hidden />

            <p
              className="cm-home-brand-visual-intro cm-stagger-2 cm-home-brand-visual-grid-intro"
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: 1.6,
                fontWeight: 600,
                color: "var(--cm-text, #374151)",
                textAlign: "left",
              }}
            >
              {HOME_INTRO}
            </p>

            <div className="cm-home-brand-visual-grid-menu">{menuButton}</div>
          </div>
        </>
      ) : (
        <>
          {/* Auth pages / callbacks: compact layout (no hamburger) */}
          <Link
            href="/"
            aria-label="Classmateホーム"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              minWidth: 0,
              textDecoration: "none",
              color: "inherit",
              width: "fit-content",
              maxWidth: "100%",
            }}
          >
            <img
              src={BRAND_MARK_SRC}
              alt=""
              width={markSize}
              height={markSize}
              decoding="async"
              fetchPriority="high"
              aria-hidden
              style={brandMarkStyle(markSize)}
            />
            <BrandWordmark />
          </Link>

          <p
            className="cm-home-brand-visual-intro cm-stagger-2"
            style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.6,
              fontWeight: 600,
              color: "var(--cm-text, #374151)",
              textAlign: "left",
            }}
          >
            {HOME_INTRO}
          </p>
        </>
      )}
    </div>
  );
}
