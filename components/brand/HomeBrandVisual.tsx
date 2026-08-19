import {
  BRAND_LOGO_ALT,
  BRAND_LOGO_HEIGHT,
  BRAND_LOGO_PATH,
  BRAND_LOGO_WIDTH,
  HOME_INTRO,
} from "@/lib/seo";

/**
 * First-view brand mark for the marketing home page.
 * Uses a div (not header) so classroom nameplate CSS does not overlap.
 */
export function HomeBrandVisual() {
  return (
    <div
      className="cm-home-brand-visual cm-stagger-1"
      style={{
        display: "grid",
        gap: 10,
        marginBottom: 14,
        minWidth: 0,
        maxWidth: "100%",
        padding: "14px 12px 10px",
        borderRadius: 22,
        background:
          "linear-gradient(180deg, rgba(238,246,255,0.88) 0%, rgba(204,251,241,0.62) 100%)",
        border: "none",
        boxShadow: "none",
      }}
    >
      <div
        className="cm-home-brand-visual-frame"
        style={{
          width: "100%",
          maxWidth: 720,
          margin: "0 auto",
          borderRadius: 18,
          overflow: "hidden",
          background: "transparent",
          border: "none",
          boxShadow: "none",
        }}
      >
        <img
          src={BRAND_LOGO_PATH}
          alt={BRAND_LOGO_ALT}
          width={BRAND_LOGO_WIDTH}
          height={BRAND_LOGO_HEIGHT}
          decoding="async"
          fetchPriority="high"
          style={{
            display: "block",
            width: "100%",
            height: "auto",
          }}
        />
      </div>
      <p
        className="cm-home-brand-visual-intro"
        style={{
          margin: 0,
          fontSize: 14,
          lineHeight: 1.6,
          fontWeight: 700,
          color: "var(--cm-text, #374151)",
          textAlign: "center",
          maxWidth: "34rem",
          justifySelf: "center",
        }}
      >
        {HOME_INTRO}
      </p>
    </div>
  );
}
