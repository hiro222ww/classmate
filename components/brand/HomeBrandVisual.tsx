"use client";

import { HOME_INTRO } from "@/lib/seo";

type Props = {
  menuButton?: React.ReactNode;
};

/**
 * First-view brand header for the home page.
 * Character icon (apple-touch-icon) + "Classmate" wordmark + optional ☰.
 */
export function HomeBrandVisual({ menuButton }: Props) {
  const hasMenu = Boolean(menuButton);

  return (
    <div
      className="cm-home-brand-visual cm-stagger-1"
      style={{
        display: "grid",
        gap: 8,
        minWidth: 0,
        maxWidth: "100%",
        padding: "16px 16px 14px",
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
                height: 38px;
                background: rgba(15, 23, 42, 0.15);
                justify-self: center;
              }
            }
          `}</style>

          <div className="cm-home-brand-visual-grid">
            <div className="cm-home-brand-visual-grid-brand">
              <img
                src="/apple-touch-icon.png"
                alt=""
                width={48}
                height={48}
                decoding="async"
                fetchPriority="high"
                aria-hidden
                style={{
                  borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,0.8)",
                  boxShadow: "0 2px 8px rgba(15,23,42,0.08)",
                  flexShrink: 0,
                }}
              />

              <div style={{ minWidth: 0 }}>
                <span
                  style={{
                    fontSize: 22,
                    fontWeight: 900,
                    color: "#1e3a5f",
                    letterSpacing: 0.3,
                    lineHeight: 1.1,
                  }}
                >
                  Classmate
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#64748b",
                    letterSpacing: "0.04em",
                    marginTop: 1,
                  }}
                >
                  クラスメイト
                </span>
              </div>
            </div>

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
          {/* Auth pages / callbacks: keep old compact layout (no hamburger) */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <img
              src="/apple-touch-icon.png"
              alt=""
              width={44}
              height={44}
              decoding="async"
              fetchPriority="high"
              aria-hidden
              style={{
                borderRadius: "50%",
                border: "2px solid rgba(255,255,255,0.8)",
                boxShadow: "0 2px 8px rgba(15,23,42,0.08)",
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  color: "#1e3a5f",
                  letterSpacing: 0.3,
                  lineHeight: 1.1,
                }}
              >
                Classmate
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#64748b",
                  letterSpacing: "0.04em",
                  marginTop: 1,
                }}
              >
                クラスメイト
              </span>
            </div>
          </div>

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
