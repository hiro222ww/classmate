"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  DEFAULT_HOME_BANNERS,
  resolveActiveHomeBanners,
  type HomeBanner,
} from "@/lib/homeBanners";

type HomePromoBannerProps = {
  className?: string;
  /** Override catalog (tests / future CMS). Defaults to built-in sunset. */
  banners?: HomeBanner[];
  /** Auto-advance when 2+ banners (ms). 0 disables. */
  autoPlayMs?: number;
};

/**
 * Home photo banner — single full-bleed visual today; data-ready for carousel / ads.
 */
export function HomePromoBanner({
  className,
  banners = DEFAULT_HOME_BANNERS,
  autoPlayMs = 6500,
}: HomePromoBannerProps) {
  const active = useMemo(() => resolveActiveHomeBanners(banners), [banners]);
  const count = active.length;
  const [index, setIndex] = useState(0);
  const reduceMotionRef = useRef(false);
  const dragRef = useRef<{ x: number; y: number; active: boolean } | null>(
    null
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    reduceMotionRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
  }, []);

  useEffect(() => {
    setIndex((i) => (count === 0 ? 0 : Math.min(i, count - 1)));
  }, [count]);

  const go = useCallback(
    (next: number) => {
      if (count <= 1) return;
      setIndex(((next % count) + count) % count);
    },
    [count]
  );

  useEffect(() => {
    if (count <= 1 || autoPlayMs <= 0 || reduceMotionRef.current) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, autoPlayMs);
    return () => window.clearInterval(id);
  }, [count, autoPlayMs]);

  const onPointerDown = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (count <= 1) return;
    dragRef.current = { x: ev.clientX, y: ev.clientY, active: true };
  };

  const onPointerUp = (ev: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag?.active || count <= 1) return;
    const dx = ev.clientX - drag.x;
    const dy = ev.clientY - drag.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) go(index + 1);
    else go(index - 1);
  };

  if (count === 0) return null;

  const current = active[index] ?? active[0]!;
  const showChrome = count > 1;
  const showAdMark =
    current.kind === "ad" || Boolean(current.sponsoredLabel?.trim());

  const media = (
    <div
      className="cm-home-promo-banner-media"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
    >
      {active.map((banner, i) => (
        <img
          key={banner.id}
          src={banner.imageSrc}
          alt={banner.imageAlt ?? ""}
          width={1280}
          height={720}
          decoding="async"
          fetchPriority={i === 0 ? "high" : "low"}
          className={[
            "cm-home-promo-banner-img",
            i === index ? "cm-home-promo-banner-img--active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          draggable={false}
        />
      ))}
      <div className="cm-home-promo-banner-veil" aria-hidden />
      {current.headline ? (
        <p className="cm-home-promo-banner-copy">{current.headline}</p>
      ) : null}
      {showAdMark ? (
        <span className="cm-home-promo-banner-ad">
          {current.sponsoredLabel?.trim() || "広告"}
        </span>
      ) : null}
      {showChrome ? (
        <div className="cm-home-promo-banner-dots" role="tablist" aria-label="バナー">
          {active.map((banner, i) => (
            <button
              key={banner.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`バナー ${i + 1}`}
              className={[
                "cm-home-promo-banner-dot",
                i === index ? "cm-home-promo-banner-dot--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );

  const body = current.href ? (
    <Link href={current.href} className="cm-home-promo-banner-link">
      {media}
    </Link>
  ) : (
    media
  );

  return (
    <section
      className={[
        "cm-home-promo-banner",
        showChrome ? "cm-home-promo-banner--multi" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label="Classmate"
      aria-roledescription={showChrome ? "carousel" : undefined}
    >
      {body}
    </section>
  );
}

