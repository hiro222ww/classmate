"use client";

import { useEffect, useState } from "react";

type MetricLine = {
  id: string;
  color: string;
  top: number;
  left: number;
  text: string;
};

type GapHit = {
  kind: string;
  px: number;
  detail: string;
};

type Probe = {
  lines: MetricLine[];
  gaps: GapHit[];
  ancestors: string[];
};

const TARGETS: { id: string; sel: string; label: string; color: string }[] = [
  { id: "sheet", sel: ".cm-bottom-sheet", label: "sheet", color: "#ef4444" },
  {
    id: "scroll",
    sel: ".cm-bottom-sheet-scroll",
    label: "scroll",
    color: "#22c55e",
  },
  {
    id: "children",
    sel: ".cm-home-menu-root",
    label: "children",
    color: "#3b82f6",
  },
  {
    id: "account",
    sel: ".cm-home-menu-account",
    label: "account",
    color: "#a855f7",
  },
  {
    id: "google",
    sel: ".cm-home-menu-google",
    label: "google",
    color: "#f97316",
  },
];

function fmt(n: number) {
  return `${Math.round(n * 10) / 10}`;
}

function readBox(el: Element): string {
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return [
    `h=${fmt(r.height)}`,
    `minH=${cs.minHeight}`,
    `maxH=${cs.maxHeight}`,
    `mt=${cs.marginTop}`,
    `mb=${cs.marginBottom}`,
    `flex=${cs.flex}`,
    `grow=${cs.flexGrow}`,
  ].join(" ");
}

function interestingAncestor(el: Element): string {
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const cls = typeof el.className === "string" ? el.className : "";
  const tag = el.tagName.toLowerCase();
  const name = cls
    ? `${tag}.${cls.split(/\s+/).filter(Boolean).slice(0, 2).join(".")}`
    : tag;
  const flags: string[] = [];
  if (cs.marginTop === "auto" || Number.parseFloat(cs.marginTop) > 8) {
    flags.push(`mt=${cs.marginTop}`);
  }
  if (Number.parseFloat(cs.marginBottom) > 8) {
    flags.push(`mb=${cs.marginBottom}`);
  }
  if (Number.parseFloat(cs.paddingBottom) > 8) {
    flags.push(`pb=${cs.paddingBottom}`);
  }
  if (Number.parseFloat(cs.paddingTop) > 8) {
    flags.push(`pt=${cs.paddingTop}`);
  }
  if (cs.flexGrow !== "0") flags.push(`grow=${cs.flexGrow}`);
  if (/\b1\b/.test(cs.flex)) flags.push(`flex=${cs.flex}`);
  if (cs.minHeight !== "0px" && cs.minHeight !== "auto") {
    flags.push(`minH=${cs.minHeight}`);
  }
  if (cs.maxHeight !== "none") flags.push(`maxH=${cs.maxHeight}`);
  if (cs.height !== "auto" && Number.parseFloat(cs.height) > 0) {
    flags.push(`cssH=${cs.height}`);
  }
  if (cs.position === "absolute" || cs.position === "fixed") {
    flags.push(`${cs.position}/bottom=${cs.bottom}`);
  }
  if (
    cs.justifyContent === "space-between" ||
    cs.justifyContent === "flex-end"
  ) {
    flags.push(`jc=${cs.justifyContent}`);
  }
  if (
    cs.alignContent === "space-between" ||
    cs.alignContent === "space-around"
  ) {
    flags.push(`ac=${cs.alignContent}`);
  }
  if (cs.display.includes("flex") || cs.display.includes("grid")) {
    flags.push(`d=${cs.display}`);
  }
  if (cs.gridTemplateRows && cs.gridTemplateRows !== "none") {
    flags.push(`gtr=${cs.gridTemplateRows}`);
  }
  flags.push(`boxH=${fmt(r.height)}`);
  return `${name} { ${flags.join("; ")} }`;
}

function childGaps(parent: Element, kind: string): GapHit[] {
  const hits: GapHit[] = [];
  const kids = Array.from(parent.children) as HTMLElement[];
  for (let i = 0; i < kids.length - 1; i++) {
    const a = kids[i].getBoundingClientRect();
    const b = kids[i + 1].getBoundingClientRect();
    const gap = b.top - a.bottom;
    if (gap > 8) {
      const aLabel = (kids[i].textContent || "").trim().slice(0, 24);
      const bLabel = (kids[i + 1].textContent || "").trim().slice(0, 24);
      hits.push({
        kind,
        px: gap,
        detail: `"${aLabel}" → "${bLabel}" の間に ${fmt(gap)}px`,
      });
    }
  }
  return hits;
}

function probe(root: HTMLElement): Probe {
  const lines: MetricLine[] = [];
  for (const t of TARGETS) {
    const target = root.querySelector(t.sel);
    if (!target) continue;
    const r = target.getBoundingClientRect();
    lines.push({
      id: t.id,
      color: t.color,
      top: Math.max(4, r.top + 2),
      left: Math.max(4, Math.min(r.left + 2, window.innerWidth - 180)),
      text: `${t.label}: ${readBox(target)}`,
    });
  }

  const gaps: GapHit[] = [];
  const sheet = root.querySelector(".cm-bottom-sheet");
  const scroll = root.querySelector(".cm-bottom-sheet-scroll");
  const body = root.querySelector(".cm-bottom-sheet-body");
  const nav = root.querySelector(".cm-home-menu-root");
  const google = root.querySelector(".cm-home-menu-google");
  const account = root.querySelector(".cm-home-menu-account");

  if (sheet && nav) {
    const belowNav =
      sheet.getBoundingClientRect().bottom - nav.getBoundingClientRect().bottom;
    if (belowNav > 4) {
      gaps.push({
        kind: "sheet底-nav底",
        px: belowNav,
        detail: `白シートが nav より ${fmt(belowNav)}px 長い（未使用白領域候補）`,
      });
    }
  }

  if (scroll && body) {
    const belowBody =
      scroll.getBoundingClientRect().bottom -
      body.getBoundingClientRect().bottom;
    if (belowBody > 4) {
      gaps.push({
        kind: "scroll底-body底",
        px: belowBody,
        detail: `scroll が body より ${fmt(belowBody)}px 長い`,
      });
    }
  }

  if (nav) gaps.push(...childGaps(nav, "nav子要素間"));
  if (account) gaps.push(...childGaps(account, "account子要素間"));

  if (google && sheet) {
    const belowGoogle =
      sheet.getBoundingClientRect().bottom -
      google.getBoundingClientRect().bottom;
    if (belowGoogle > 4) {
      gaps.push({
        kind: "sheet底-google底",
        px: belowGoogle,
        detail: `Google行の下に ${fmt(belowGoogle)}px の白（sheet内）`,
      });
    }
  }

  gaps.sort((a, b) => b.px - a.px);

  const ancestors: string[] = [];
  if (google) {
    let el: Element | null = google;
    let depth = 0;
    while (el && depth < 12) {
      ancestors.push(interestingAncestor(el));
      if (el.classList.contains("cm-bottom-sheet-root")) break;
      el = el.parentElement;
      depth += 1;
    }
  }

  return { lines, gaps, ancestors };
}

/**
 * Device QA overlay for ?bsdebug=1.
 * Outlines live in CSS; this paints computed metrics + gap ownership.
 * Investigation only — no layout / height fixes.
 */
export default function BottomSheetLayoutDebug({
  open,
  rootRef,
}: {
  open: boolean;
  rootRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [data, setData] = useState<Probe | null>(null);

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

  return (
    <>
      {data.lines.map((line) => (
        <div
          key={line.id}
          className="cm-bs-debug-metric"
          style={{
            top: line.top,
            left: line.left,
            borderColor: line.color,
            color: line.color,
          }}
        >
          {line.text}
        </div>
      ))}
      <div className="cm-bs-debug-panel">
        <div className="cm-bs-debug-panel__title">bsdebug gap probe</div>
        {data.gaps.length === 0 ? (
          <div>大きな隙間なし（子要素は密着）</div>
        ) : (
          data.gaps.slice(0, 6).map((g, i) => (
            <div key={`${g.kind}-${i}`}>
              <strong>{fmt(g.px)}px</strong> [{g.kind}] {g.detail}
            </div>
          ))
        )}
        <div className="cm-bs-debug-panel__title">Google → ancestors</div>
        {data.ancestors.map((a, i) => (
          <div key={i} className="cm-bs-debug-panel__anc">
            {i}. {a}
          </div>
        ))}
      </div>
    </>
  );
}
