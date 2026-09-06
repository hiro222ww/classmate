"use client";

import { useEffect, useState } from "react";

type Box = { top: number; bottom: number; height: number; width?: number };
type StyleSnap = {
  height: string;
  minHeight: string;
  maxHeight: string;
  flexGrow: string;
  flex: string;
  position: string;
  top: string;
  bottom: string;
  inset: string;
  overflowY: string;
  display: string;
  background: string;
  backgroundColor: string;
  zIndex: string;
};

type HitNode = {
  tag: string;
  className: string;
  id: string;
  box: Box;
  style: StyleSnap;
};

type ProbePoint = {
  name: string;
  x: number;
  y: number;
  hits: HitNode[];
};

type NamedTarget = {
  label: string;
  box: Box | null;
  style: StyleSnap | null;
  exists: boolean;
};

type GeometryProbe = {
  sheet: Box;
  scroll: Box;
  body: Box;
  content: Box | null;
  lastItem: Box | null;
  viewport: {
    innerHeight: number;
    visualHeight: number;
    visualOffsetTop: number;
    visualOffsetLeft: number;
  };
  gapSheetMinusLast: number | null;
  gapBelowSheetToInner: number | null;
  gapBelowSheetToVisual: number | null;
  sheetStyle: StyleSnap;
  scrollStyle: StyleSnap;
  rootStyle: StyleSnap | null;
  named: NamedTarget[];
  points: ProbePoint[];
  verdict: string;
};

function round(n: number) {
  return Math.round(n * 10) / 10;
}

function boxOf(el: Element): Box {
  const r = el.getBoundingClientRect();
  return {
    top: round(r.top),
    bottom: round(r.bottom),
    height: round(r.height),
    width: round(r.width),
  };
}

function styleOf(el: Element): StyleSnap {
  const cs = getComputedStyle(el);
  return {
    height: cs.height,
    minHeight: cs.minHeight,
    maxHeight: cs.maxHeight,
    flexGrow: cs.flexGrow,
    flex: cs.flex,
    position: cs.position,
    top: cs.top,
    bottom: cs.bottom,
    inset: `${cs.top}/${cs.right}/${cs.bottom}/${cs.left}`,
    overflowY: cs.overflowY,
    display: cs.display,
    background: cs.backgroundImage !== "none" ? cs.backgroundImage.slice(0, 80) : cs.backgroundColor,
    backgroundColor: cs.backgroundColor,
    zIndex: cs.zIndex,
  };
}

function hitOf(el: Element): HitNode {
  return {
    tag: el.tagName.toLowerCase(),
    className:
      typeof (el as HTMLElement).className === "string"
        ? (el as HTMLElement).className.trim().slice(0, 80)
        : "",
    id: (el as HTMLElement).id || "",
    box: boxOf(el),
    style: styleOf(el),
  };
}

function findLastMenuItem(root: Element): Element | null {
  const nav = root.querySelector(
    ".cm-bottom-sheet-body nav, .cm-home-menu-root, nav"
  );
  if (!nav) return null;
  const rows = nav.querySelectorAll("a, button");
  return rows.length ? rows[rows.length - 1] : nav.lastElementChild;
}

function namedTarget(label: string, el: Element | null): NamedTarget {
  if (!el) return { label, box: null, style: null, exists: false };
  return { label, box: boxOf(el), style: styleOf(el), exists: true };
}

function samplePoint(
  name: string,
  x: number,
  y: number,
  excludeHud: Element | null
): ProbePoint {
  const cx = Math.max(0, Math.min(window.innerWidth - 1, x));
  const cy = Math.max(0, Math.min(window.innerHeight - 1, y));
  const list = document.elementsFromPoint(cx, cy);
  const hits: HitNode[] = [];
  for (const el of list) {
    if (excludeHud && (el === excludeHud || excludeHud.contains(el))) continue;
    // Skip crosshair markers
    if (
      el instanceof HTMLElement &&
      el.dataset &&
      (el.dataset.bsHitMarker != null || el.dataset.bsGeomDebug != null)
    ) {
      continue;
    }
    hits.push(hitOf(el));
    if (hits.length >= 5) break;
  }
  return { name, x: round(cx), y: round(cy), hits };
}

function probe(root: HTMLElement, hudEl: Element | null): GeometryProbe | null {
  const sheet = root.querySelector(".cm-bottom-sheet");
  const scroll = root.querySelector(".cm-bottom-sheet-scroll");
  const body = root.querySelector(".cm-bottom-sheet-body");
  if (!sheet || !scroll || !body) return null;

  const content =
    body.firstElementChild instanceof HTMLElement
      ? body.firstElementChild
      : null;
  const lastItem = findLastMenuItem(root);

  const sheetBox = boxOf(sheet);
  const scrollBox = boxOf(scroll);
  const bodyBox = boxOf(body);
  const contentBox = content ? boxOf(content) : null;
  const lastBox = lastItem ? boxOf(lastItem) : null;

  const vv = window.visualViewport;
  const visualHeight = vv?.height ?? window.innerHeight;
  const visualOffsetTop = vv?.offsetTop ?? 0;
  const visualOffsetLeft = vv?.offsetLeft ?? 0;
  const visualBottom = visualOffsetTop + visualHeight;

  const gapSheetMinusLast = lastBox
    ? round(sheetBox.bottom - lastBox.bottom)
    : null;
  const gapBelowSheetToInner = round(window.innerHeight - sheetBox.bottom);
  const gapBelowSheetToVisual = round(visualBottom - sheetBox.bottom);

  const cx = Math.round(window.innerWidth / 2);

  // 1) Just under Google / last row (usually still near sheet padding)
  const yUnderGoogle = lastBox
    ? lastBox.bottom + 8
    : sheetBox.bottom - 4;
  // 2) Mid of the region BELOW the sheet (the contested white/gray band)
  const yBelowSheetBand =
    gapBelowSheetToVisual > 8
      ? sheetBox.bottom + gapBelowSheetToVisual / 2
      : sheetBox.bottom + 40;
  // 3) Just above Safari chrome / visual bottom
  const yAboveSafari = visualBottom - 12;

  const points = [
    samplePoint("1.under-google", cx, yUnderGoogle, hudEl),
    samplePoint("2.below-sheet-band", cx, yBelowSheetBand, hudEl),
    samplePoint("3.above-safari", cx, yAboveSafari, hudEl),
  ];

  const named = [
    namedTarget("html", document.documentElement),
    namedTarget("body", document.body),
    namedTarget(
      "main.cm-classroom-scope",
      document.querySelector("main.cm-classroom-scope")
    ),
    namedTarget(".cm-home-body", document.querySelector(".cm-home-body")),
    namedTarget(".cm-bottom-sheet-root", root),
    namedTarget(".cm-bottom-sheet", sheet),
  ];

  let verdict = "inconclusive";
  if (gapBelowSheetToVisual > 40) {
    const topHit = points[1]?.hits[0];
    if (topHit) {
      verdict = `BELOW-SHEET band ~${gapBelowSheetToVisual}px. Top hit at mid-band: <${topHit.tag}.${topHit.className}> bg=${topHit.style.backgroundColor} pos=${topHit.style.position}`;
    } else {
      verdict = `BELOW-SHEET band ~${gapBelowSheetToVisual}px (sheet ends above visual bottom)`;
    }
  } else if (gapSheetMinusLast != null && gapSheetMinusLast <= 80) {
    verdict =
      "Sheet hugs content; inspect below-sheet band / Safari chrome gap if any";
  }

  return {
    sheet: sheetBox,
    scroll: scrollBox,
    body: bodyBox,
    content: contentBox,
    lastItem: lastBox,
    viewport: {
      innerHeight: round(window.innerHeight),
      visualHeight: round(visualHeight),
      visualOffsetTop: round(visualOffsetTop),
      visualOffsetLeft: round(visualOffsetLeft),
    },
    gapSheetMinusLast,
    gapBelowSheetToInner,
    gapBelowSheetToVisual,
    sheetStyle: styleOf(sheet),
    scrollStyle: styleOf(scroll),
    rootStyle: styleOf(root),
    named,
    points,
    verdict,
  };
}

/**
 * On-device geometry + paint hit-test HUD for ?bsdebug=1.
 * Measurement only — does not change BottomSheet layout CSS.
 */
export default function BottomSheetGeometryDebug({
  open,
  rootRef,
}: {
  open: boolean;
  rootRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [data, setData] = useState<GeometryProbe | null>(null);
  const [hudEl, setHudEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      setData(null);
      return;
    }

    let raf = 0;
    const run = () => {
      const root = rootRef.current;
      if (!root) return;
      setData(probe(root, hudEl));
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(run);
    };

    schedule();
    const t1 = window.setTimeout(schedule, 50);
    const t2 = window.setTimeout(schedule, 250);
    const t3 = window.setTimeout(schedule, 600);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [open, rootRef, hudEl]);

  if (!open) return null;

  const line = (label: string, value: string) => (
    <div key={label}>
      <strong>{label}</strong> {value}
    </div>
  );

  return (
    <>
      {data?.points.map((p) => (
        <div
          key={p.name}
          data-bs-hit-marker={p.name}
          className="cm-bs-hit-marker"
          style={{ left: p.x - 6, top: p.y - 6 }}
          title={p.name}
        />
      ))}
      <div
        ref={setHudEl}
        className="cm-bs-geom-debug"
        data-bs-geom-debug="1"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cm-bs-geom-debug__title">bsdebug geometry</div>
        {data ? (
          <>
            {line(
              "sheet",
              `t=${data.sheet.top} b=${data.sheet.bottom} h=${data.sheet.height}`
            )}
            {line(
              "scroll",
              `t=${data.scroll.top} b=${data.scroll.bottom} h=${data.scroll.height}`
            )}
            {line(
              "lastItem",
              data.lastItem
                ? `t=${data.lastItem.top} b=${data.lastItem.bottom} h=${data.lastItem.height}`
                : "n/a"
            )}
            {line(
              "viewport",
              `inner=${data.viewport.innerHeight} vv=${data.viewport.visualHeight} vv.offsetTop=${data.viewport.visualOffsetTop}`
            )}
            {line(
              "sheet.bottom - last.bottom",
              data.gapSheetMinusLast == null
                ? "n/a"
                : `${data.gapSheetMinusLast}px`
            )}
            {line(
              "innerH - sheet.bottom",
              data.gapBelowSheetToInner == null
                ? "n/a"
                : `${data.gapBelowSheetToInner}px`
            )}
            {line(
              "visualBottom - sheet.bottom",
              data.gapBelowSheetToVisual == null
                ? "n/a"
                : `${data.gapBelowSheetToVisual}px`
            )}
            {line(
              "root computed",
              data.rootStyle
                ? `bg=${data.rootStyle.backgroundColor} pos=${data.rootStyle.position} inset=${data.rootStyle.inset} h=${data.rootStyle.height} z=${data.rootStyle.zIndex}`
                : "n/a"
            )}

            <div className="cm-bs-geom-debug__title">named surfaces</div>
            {data.named.map((n) =>
              n.exists && n.box && n.style ? (
                <div key={n.label} className="cm-bs-geom-debug__anc">
                  {n.label} box.h={n.box.height} t={n.box.top} b={n.box.bottom}{" "}
                  bg={n.style.backgroundColor} bgImg=
                  {n.style.background.slice(0, 40)} pos={n.style.position} h=
                  {n.style.height} min={n.style.minHeight} max=
                  {n.style.maxHeight} top={n.style.top} bottom={n.style.bottom}{" "}
                  inset={n.style.inset} z={n.style.zIndex}
                </div>
              ) : (
                <div key={n.label} className="cm-bs-geom-debug__anc">
                  {n.label} MISSING
                </div>
              )
            )}

            <div className="cm-bs-geom-debug__title">
              elementsFromPoint (top 5)
            </div>
            {data.points.map((p) => (
              <div key={p.name} className="cm-bs-geom-debug__point">
                <div className="cm-bs-geom-debug__point-title">
                  {p.name} @ ({p.x},{p.y})
                </div>
                {p.hits.map((h, i) => (
                  <div key={`${p.name}-${i}`} className="cm-bs-geom-debug__anc">
                    {i}. &lt;{h.tag}
                    {h.id ? `#${h.id}` : ""}
                    {h.className ? `.${h.className.split(" ")[0]}` : ""}&gt; box=
                    {h.box.height}px [{h.box.top}-{h.box.bottom}] bg=
                    {h.style.backgroundColor} pos={h.style.position} h=
                    {h.style.height} min={h.style.minHeight} max=
                    {h.style.maxHeight} top={h.style.top} bottom=
                    {h.style.bottom} inset={h.style.inset} z={h.style.zIndex}
                  </div>
                ))}
              </div>
            ))}

            <div className="cm-bs-geom-debug__verdict">{data.verdict}</div>
          </>
        ) : (
          <div>measuring…</div>
        )}
      </div>
    </>
  );
}
