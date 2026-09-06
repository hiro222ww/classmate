"use client";

import { useEffect, useState } from "react";

type Box = { top: number; bottom: number; height: number };
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
};

type AncestorSnap = {
  label: string;
  box: Box;
  style: StyleSnap;
};

type GeometryProbe = {
  sheet: Box;
  scroll: Box;
  body: Box;
  content: Box | null;
  lastItem: Box | null;
  viewport: { innerHeight: number; visualHeight: number };
  gapSheetMinusLast: number | null;
  gapScrollMinusLast: number | null;
  ancestors: AncestorSnap[];
  sheetStyle: StyleSnap;
  scrollStyle: StyleSnap;
  verdict: string;
};

function round(n: number) {
  return Math.round(n * 10) / 10;
}

function boxOf(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { top: round(r.top), bottom: round(r.bottom), height: round(r.height) };
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
  };
}

function labelOf(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : "";
  const cls =
    typeof (el as HTMLElement).className === "string"
      ? `.${(el as HTMLElement).className
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .join(".")}`
      : "";
  return `${tag}${id}${cls}`;
}

function findLastMenuItem(root: Element): Element | null {
  const nav = root.querySelector(".cm-bottom-sheet-body nav, .cm-home-menu-root, nav");
  if (!nav) return null;
  const rows = nav.querySelectorAll("a, button");
  return rows.length ? rows[rows.length - 1] : nav.lastElementChild;
}

function probe(root: HTMLElement): GeometryProbe | null {
  const sheet = root.querySelector(".cm-bottom-sheet");
  const scroll = root.querySelector(".cm-bottom-sheet-scroll");
  const body = root.querySelector(".cm-bottom-sheet-body");
  if (!sheet || !scroll || !body) return null;

  const content =
    body.firstElementChild instanceof HTMLElement ? body.firstElementChild : null;
  const lastItem = findLastMenuItem(root);

  const sheetBox = boxOf(sheet);
  const scrollBox = boxOf(scroll);
  const bodyBox = boxOf(body);
  const contentBox = content ? boxOf(content) : null;
  const lastBox = lastItem ? boxOf(lastItem) : null;

  const ancestors: AncestorSnap[] = [];
  let el: Element | null = sheet;
  let depth = 0;
  while (el && depth < 8) {
    ancestors.push({
      label: labelOf(el),
      box: boxOf(el),
      style: styleOf(el),
    });
    if (el === document.documentElement) break;
    el = el.parentElement;
    depth += 1;
  }

  const gapSheetMinusLast = lastBox
    ? round(sheetBox.bottom - lastBox.bottom)
    : null;
  const gapScrollMinusLast = lastBox
    ? round(scrollBox.bottom - lastBox.bottom)
    : null;

  const vv = window.visualViewport?.height ?? window.innerHeight;
  let verdict = "inconclusive";
  if (gapSheetMinusLast != null && gapSheetMinusLast > 80) {
    const nearMax =
      Math.abs(sheetBox.height - vv * 0.8) < 24 ||
      Math.abs(sheetBox.height - window.innerHeight * 0.8) < 24;
    if (nearMax) {
      verdict =
        "LIKELY: .cm-bottom-sheet used height ≈ 80% viewport (max-height winning), white gap = sheet.bottom - lastItem.bottom";
    } else if (
      gapScrollMinusLast != null &&
      Math.abs(gapScrollMinusLast - gapSheetMinusLast) < 8
    ) {
      verdict =
        "LIKELY: .cm-bottom-sheet-scroll fills tall sheet; white painted by .cm-bottom-sheet background";
    } else {
      verdict = `LIKELY: blank under last item ≈ ${gapSheetMinusLast}px inside sheet`;
    }
  } else if (gapSheetMinusLast != null && gapSheetMinusLast <= 80) {
    verdict = "Sheet hugs content (gap under last item is small)";
  }

  return {
    sheet: sheetBox,
    scroll: scrollBox,
    body: bodyBox,
    content: contentBox,
    lastItem: lastBox,
    viewport: {
      innerHeight: round(window.innerHeight),
      visualHeight: round(vv),
    },
    gapSheetMinusLast,
    gapScrollMinusLast,
    ancestors,
    sheetStyle: styleOf(sheet),
    scrollStyle: styleOf(scroll),
    verdict,
  };
}

/**
 * On-device geometry HUD for ?bsdebug=1.
 * Measurement only — no layout changes.
 */
export default function BottomSheetGeometryDebug({
  open,
  rootRef,
}: {
  open: boolean;
  rootRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [data, setData] = useState<GeometryProbe | null>(null);

  useEffect(() => {
    if (!open) {
      setData(null);
      return;
    }

    let raf = 0;
    const run = () => {
      const root = rootRef.current;
      if (!root) return;
      setData(probe(root));
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

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, [open, rootRef]);

  if (!open || !data) return null;

  const line = (label: string, value: string) => (
    <div key={label}>
      <strong>{label}</strong> {value}
    </div>
  );

  return (
    <div
      className="cm-bs-geom-debug"
      data-bs-geom-debug="1"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="cm-bs-geom-debug__title">bsdebug geometry</div>
      {line(
        "sheet",
        `t=${data.sheet.top} b=${data.sheet.bottom} h=${data.sheet.height}`
      )}
      {line(
        "scroll",
        `t=${data.scroll.top} b=${data.scroll.bottom} h=${data.scroll.height}`
      )}
      {line(
        "body/content",
        `body.h=${data.body.height}` +
          (data.content ? ` content.h=${data.content.height}` : "")
      )}
      {line(
        "lastItem",
        data.lastItem
          ? `t=${data.lastItem.top} b=${data.lastItem.bottom} h=${data.lastItem.height}`
          : "n/a"
      )}
      {line(
        "viewport",
        `inner=${data.viewport.innerHeight} vv=${data.viewport.visualHeight}`
      )}
      {line(
        "sheet.bottom - last.bottom",
        data.gapSheetMinusLast == null ? "n/a" : `${data.gapSheetMinusLast}px`
      )}
      {line(
        "scroll.bottom - last.bottom",
        data.gapScrollMinusLast == null ? "n/a" : `${data.gapScrollMinusLast}px`
      )}
      {line(
        "sheet computed",
        `h=${data.sheetStyle.height} min=${data.sheetStyle.minHeight} max=${data.sheetStyle.maxHeight} grow=${data.sheetStyle.flexGrow} pos=${data.sheetStyle.position} top=${data.sheetStyle.top} bottom=${data.sheetStyle.bottom} oy=${data.sheetStyle.overflowY}`
      )}
      {line(
        "scroll computed",
        `h=${data.scrollStyle.height} min=${data.scrollStyle.minHeight} max=${data.scrollStyle.maxHeight} flex=${data.scrollStyle.flex} grow=${data.scrollStyle.flexGrow} oy=${data.scrollStyle.overflowY}`
      )}
      <div className="cm-bs-geom-debug__title">ancestors</div>
      {data.ancestors.map((a, i) => (
        <div key={`${a.label}-${i}`} className="cm-bs-geom-debug__anc">
          {i}. {a.label} h={a.box.height} max={a.style.maxHeight} min=
          {a.style.minHeight} grow={a.style.flexGrow} pos={a.style.position} top=
          {a.style.top} bottom={a.style.bottom} inset={a.style.inset}
        </div>
      ))}
      <div className="cm-bs-geom-debug__verdict">{data.verdict}</div>
    </div>
  );
}
