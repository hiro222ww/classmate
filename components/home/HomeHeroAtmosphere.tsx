"use client";

type HomeHeroAtmosphereProps = {
  className?: string;
  /** Short catchphrase. Keep ≤ ~18 chars for mobile. */
  catchphrase?: string | null;
};

/**
 * Soft worldview banner for home — illustration + short line only.
 * No fake social proof or invented class data.
 */
export function HomeHeroAtmosphere({
  className,
  catchphrase = "人との出会いで景色が変わる",
}: HomeHeroAtmosphereProps) {
  return (
    <section
      className={["cm-home-hero-atmosphere", className].filter(Boolean).join(" ")}
      aria-label="Classmate"
    >
      <div className="cm-home-hero-atmosphere-media">
        <img
          src="/brand/classmate-home-hero.jpg"
          alt=""
          width={1280}
          height={720}
          decoding="async"
          fetchPriority="high"
          className="cm-home-hero-atmosphere-img"
        />
        <div className="cm-home-hero-atmosphere-veil" aria-hidden />
      </div>
      {catchphrase ? (
        <p className="cm-home-hero-atmosphere-copy">{catchphrase}</p>
      ) : null}
    </section>
  );
}
