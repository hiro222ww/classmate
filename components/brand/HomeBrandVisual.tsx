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
      className="cm-home-brand-visual"
      style={{
        display: "grid",
        gap: 12,
        marginBottom: 20,
        minWidth: 0,
        maxWidth: "100%",
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
          background: "#000",
          border: "1px solid rgba(17, 24, 39, 0.12)",
          boxShadow: "0 10px 28px rgba(17, 24, 39, 0.10)",
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
          fontSize: 15,
          lineHeight: 1.7,
          fontWeight: 600,
          color: "var(--cm-text, #374151)",
          textAlign: "center",
          maxWidth: "36rem",
          justifySelf: "center",
        }}
      >
        {HOME_INTRO}
      </p>
    </div>
  );
}
