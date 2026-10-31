"use client";

type HomeHeroAtmosphereProps = {
  className?: string;
  /** Short catchphrase over the image. Keep ≤ ~18 chars. */
  catchphrase?: string | null;
  /** Bridge line under the image into the rest of home. */
  bridge?: string | null;
};

/**
 * Soft worldview banner for home — illustration + short lines only.
 * No fake social proof or invented class data.
 */
export function HomeHeroAtmosphere({
  className,
  catchphrase = "人との出会いで景色が変わる",
  bridge = "同じ空気感の人と、いま話そう",
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
        {catchphrase ? (
          <p className="cm-home-hero-atmosphere-copy">{catchphrase}</p>
        ) : null}
      </div>
      {bridge ? (
        <p className="cm-home-hero-atmosphere-bridge">{bridge}</p>
      ) : null}
    </section>
  );
}
