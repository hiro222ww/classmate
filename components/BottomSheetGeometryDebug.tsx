"use client";

import { useEffect, useState } from "react";

type Box = { top: number; bottom: number; height: number; width: number; left: number };
type HitStyle = {
  backgroundColor: string;
  backgroundImage: string;
  position: string;
  zIndex: string;
  opacity: string;
  visibility: string;
  display: string;
  overflow: string;
  clipPath: string;
  mask: string;
  transform: string;
};

type HitNode = {
  tagName: string;
  className: string;
  id: string;
  box: Box;
  style: HitStyle;
};

type ProbePoint = {
  name: string;
  x: number;
  y: number;
  topHit: string;
  hits: HitNode[];
};

type Probe = {
  myClassFound: boolean;
  myClassBox: Box | null;
  sheetBox: Box | null;
  viewport: { innerHeight: number; visualHeight: number };
  points: ProbePoint[];
  switchSummary: string;
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
    left: round(r.left),
  };
}

function hitStyleOf(el: Element): HitStyle {
  const cs = getComputedStyle(el);
  const css = cs as CSSStyleDeclaration & {
    webkitMaskImage?: string;
  };
  return {
    backgroundColor: cs.backgroundColor,
    backgroundImage:
      cs.backgroundImage === "none" ? "none" : cs.backgroundImage.slice(0, 60),
    position: cs.position,
    zIndex: cs.zIndex,
    opacity: cs.opacity,
    visibility: cs.visibility,
    display: cs.display,
    overflow: `${cs.overflowX}/${cs.overflowY}`,
    clipPath: cs.clipPath,
    mask: css.webkitMaskImage || cs.maskImage || "none",
    transform: cs.transform,
  };
}

function hitOf(el: Element): HitNode {
  return {
    tagName: el.tagName.toLowerCase(),
    className:
      typeof (el as HTMLElement).className === "string"
        ? (el as HTMLElement).className.trim().slice(0, 100)
        : "",
    id: (el as HTMLElement).id || "",
    box: boxOf(el),
    style: hitStyleOf(el),
  };
}

function findMyClassRow(root: Element): HTMLElement | null {
  const nodes = root.querySelectorAll("a, button, span, div");
  for (const node of Array.from(nodes)) {
    const text = (node.textContent || "").replace(/\s+/g, " ").trim();
    if (text === "マイクラス" || text.startsWith("マイクラス")) {
      // Prefer the row link/button ancestor when the match is an inner span.
      const row = node.closest("a, button") as HTMLElement | null;
      return row || (node as HTMLElement);
    }
  }
  return null;
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
    if (
      el instanceof HTMLElement &&
      (el.dataset.bsHitMarker != null || el.dataset.bsGeomDebug != null)
    ) {
      continue;
    }
    hits.push(hitOf(el));
    if (hits.length >= 10) break;
  }
  const top = hits[0];
  const topHit = top
    ? `<${top.tagName}${top.id ? `#${top.id}` : ""}${
        top.className ? `.${top.className.split(/\s+/)[0]}` : ""
      }> bg=${top.style.backgroundColor}`
    : "none";
  return { name, x: round(cx), y: round(cy), topHit, hits };
}

function summarizeSwitch(points: ProbePoint[]): string {
  if (points.length < 2) return "n/a";
  const lines: string[] = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].topHit;
    const cur = points[i].topHit;
    if (prev !== cur) {
      lines.push(
        `SWITCH ${points[i - 1].name} → ${points[i].name}: ${prev}  ==>  ${cur}`
      );
    } else {
      lines.push(`same ${points[i - 1].name} → ${points[i].name}: ${cur}`);
    }
  }
  return lines.join(" | ");
}

function probe(root: HTMLElement, hudEl: Element | null): Probe {
  const sheet = root.querySelector(".cm-bottom-sheet");
  const myClass = findMyClassRow(root);
  const sheetBox = sheet ? boxOf(sheet) : null;
  const myClassBox = myClass ? boxOf(myClass) : null;

  const cx = Math.round(window.innerWidth / 2);
  const points: ProbePoint[] = [];

  if (myClassBox) {
    const midY = myClassBox.top + myClassBox.height / 2;
    points.push(samplePoint("0.myclass-center", cx, midY, hudEl));
    points.push(samplePoint("1.myclass+10px", cx, myClassBox.bottom + 10, hudEl));
    points.push(
      samplePoint("2.myclass+100px", cx, myClassBox.bottom + 100, hudEl)
    );
    points.push(
      samplePoint("3.myclass+300px", cx, myClassBox.bottom + 300, hudEl)
    );
  } else {
    // Fallback: sheet mid / lower band
    const y0 = sheetBox ? sheetBox.top + sheetBox.height * 0.25 : 200;
    points.push(samplePoint("0.fallback-upper", cx, y0, hudEl));
    points.push(samplePoint("1.fallback+10", cx, y0 + 10, hudEl));
    points.push(samplePoint("2.fallback+100", cx, y0 + 100, hudEl));
    points.push(samplePoint("3.fallback+300", cx, y0 + 300, hudEl));
  }

  // Geometric center of the thin-gray band under マイクラス
  // (myclass.bottom → viewport bottom — the contested paint region).
  if (myClassBox) {
    const bandBottom = window.innerHeight;
    const grayMidY =
      myClassBox.bottom + Math.max(40, (bandBottom - myClassBox.bottom) / 2);
    points.unshift(samplePoint("G.gray-band-center", cx, grayMidY, hudEl));
  }

  const switchSummary = summarizeSwitch(
    points.filter((p) => p.name.startsWith("0") || p.name.startsWith("1") || p.name.startsWith("2") || p.name.startsWith("3"))
  );

  const grayHits = points.find((p) => p.name.startsWith("G."))?.hits ?? [];
  const topGray = grayHits[0];
  let verdict = "inconclusive";
  if (topGray) {
    verdict = `GRAY-BAND top element: <${topGray.tagName}${
      topGray.className ? `.${topGray.className.split(/\s+/).slice(0, 2).join(".")}` : ""
    }> bg=${topGray.style.backgroundColor} bgImg=${topGray.style.backgroundImage} pos=${topGray.style.position} z=${topGray.style.zIndex} opacity=${topGray.style.opacity}`;
  }

  return {
    myClassFound: Boolean(myClass),
    myClassBox,
    sheetBox,
    viewport: {
      innerHeight: round(window.innerHeight),
      visualHeight: round(window.visualViewport?.height ?? window.innerHeight),
    },
    points,
    switchSummary,
    verdict,
  };
}

/**
 * ?bsdebug=1 paint/hit diagnosis focused on the マイクラス boundary.
 * No BottomSheet height/max-height changes.
 */
export default function BottomSheetGeometryDebug({
  open,
  rootRef,
}: {
  open: boolean;
  rootRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [data, setData] = useState<Probe | null>(null);
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
      const next = probe(root, hudEl);
      setData(next);
      // Full dump for Safari Web Inspector when HUD truncates.
      try {
        console.info("[bsdebug-paint]", JSON.stringify(next));
      } catch {
        /* ignore */
      }
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(run);
    };
    schedule();
    const t1 = window.setTimeout(schedule, 80);
    const t2 = window.setTimeout(schedule, 300);
    const t3 = window.setTimeout(schedule, 700);
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
  }, [open, rootRef, hudEl]);

  if (!open) return null;

  return (
    <>
      {data?.points.map((p) => (
        <div
          key={p.name}
          data-bs-hit-marker={p.name}
          className="cm-bs-hit-marker"
          style={{ left: p.x - 6, top: p.y - 6 }}
          title={`${p.name} ${p.topHit}`}
        />
      ))}
      <div
        ref={setHudEl}
        className="cm-bs-geom-debug"
        data-bs-geom-debug="1"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cm-bs-geom-debug__title">
          paint hit-test @ マイクラス boundary
        </div>
        <div>
          colors: sheet=magenta rgb(255,0,255) / scroll=green 0.5 /
          root=blue 0.35
        </div>
        {!data ? (
          <div>measuring…</div>
        ) : (
          <>
            <div>
              myClassFound={String(data.myClassFound)}{" "}
              {data.myClassBox
                ? `box t=${data.myClassBox.top} b=${data.myClassBox.bottom} h=${data.myClassBox.height}`
                : ""}
            </div>
            <div>
              sheet{" "}
              {data.sheetBox
                ? `t=${data.sheetBox.top} b=${data.sheetBox.bottom} h=${data.sheetBox.height}`
                : "n/a"}{" "}
              viewport inner={data.viewport.innerHeight} vv=
              {data.viewport.visualHeight}
            </div>
            <div className="cm-bs-geom-debug__title">topHit switch</div>
            <div className="cm-bs-geom-debug__anc">{data.switchSummary}</div>
            <div className="cm-bs-geom-debug__title">
              elementsFromPoint (top 10)
            </div>
            {data.points.map((p) => (
              <div key={p.name} className="cm-bs-geom-debug__point">
                <div className="cm-bs-geom-debug__point-title">
                  {p.name} @ ({p.x},{p.y}) top={p.topHit}
                </div>
                {p.hits.map((h, i) => (
                  <div key={`${p.name}-${i}`} className="cm-bs-geom-debug__anc">
                    {i}. &lt;{h.tagName}
                    {h.id ? `#${h.id}` : ""}
                    {h.className
                      ? `.${h.className.split(/\s+/).slice(0, 2).join(".")}`
                      : ""}
                    &gt; bg={h.style.backgroundColor} bgImg=
                    {h.style.backgroundImage} pos={h.style.position} z=
                    {h.style.zIndex} opacity={h.style.opacity} vis=
                    {h.style.visibility} display={h.style.display} overflow=
                    {h.style.overflow} clip={h.style.clipPath} mask=
                    {h.style.mask} transform={h.style.transform} box=
                    {h.box.height}px [{h.box.top}-{h.box.bottom}]
                  </div>
                ))}
              </div>
            ))}
            <div className="cm-bs-geom-debug__verdict">{data.verdict}</div>
          </>
        )}
      </div>
    </>
  );
}
