"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

/**
 * Content-sized bottom sheet (iOS Safari safe).
 *
 * Requirements:
 * - Short content → sheet height === content (+ body pad + safe-area). No 80vh fill.
 * - Tall content → only then cap ~80% viewport and scroll inside.
 * - Do NOT put max-height + overflow:auto on the same node (iOS expands to max-height).
 * - Cap is frozen in px at open time so Safari chrome / long-press does not resize it.
 *
 * Structure:
 * - `.cm-bottom-sheet` paints white. Default: no max-height (pure content size).
 *   JS may set inline maxHeight ONLY when content exceeds the frozen cap.
 * - `.cm-bottom-sheet-scroll` default overflow:visible. JS sets overflowY:auto
 *   ONLY when capped. Never has max-height.
 *
 * Debug: `?bsdebug=1` → colored outlines (kept for device QA).
 */
export default function BottomSheet({
  open,
  onClose,
  title,
  children,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Viewport cap in px, frozen when the sheet opens (stable across URL-bar toggles). */
  const capPxRef = useRef(0);
  const prevOverflow = useRef("");
  const [debug, setDebug] = useState(false);
  const [capped, setCapped] = useState(false);

  useEffect(() => {
    try {
      setDebug(
        new URLSearchParams(window.location.search).get("bsdebug") === "1"
      );
    } catch {
      setDebug(false);
    }
  }, []);

  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  const freezeCap = useCallback(() => {
    const vh = window.visualViewport?.height ?? window.innerHeight;
    capPxRef.current = Math.max(1, Math.round(vh * 0.8));
  }, []);

  /**
   * Measure natural content height with no cap / no scrollport, then apply
   * max-height only if content actually overflows the frozen cap.
   */
  const syncSize = useCallback(() => {
    const sheet = sheetRef.current;
    const scroll = scrollRef.current;
    if (!sheet || !scroll || !open) return;

    // Reset to pure content sizing (clears any prior cap / scrollport).
    // Inline overflowY:visible overrides --capped CSS during measure.
    sheet.style.maxHeight = "";
    scroll.style.overflowY = "visible";

    // Force layout, then measure the white sheet's natural height.
    void sheet.offsetHeight;
    const natural = Math.ceil(sheet.getBoundingClientRect().height);
    const cap = capPxRef.current || Math.round(
      (window.visualViewport?.height ?? window.innerHeight) * 0.8
    );

    if (natural > cap) {
      // Cap on the sheet (overflow:hidden in CSS). Scrollport only on the child.
      // Never put max-height + overflow:auto on the same node.
      sheet.style.maxHeight = `${cap}px`;
      scroll.style.overflowY = "auto";
      setCapped(true);
    } else {
      scroll.style.overflowY = "";
      setCapped(false);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      prevOverflow.current = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = prevOverflow.current;
      // Clear inline sizing when closed.
      const sheet = sheetRef.current;
      const scroll = scrollRef.current;
      if (sheet) sheet.style.maxHeight = "";
      if (scroll) scroll.style.overflowY = "";
      setCapped(false);
    }
    return () => {
      document.body.style.overflow = prevOverflow.current;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (open && sheetRef.current) {
      const first = sheetRef.current.querySelector<HTMLElement>(
        "button, a, [tabindex]"
      );
      first?.focus();
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;

    freezeCap();
    syncSize();

    const sheet = sheetRef.current;
    const scroll = scrollRef.current;
    if (!sheet || !scroll) return;

    const ro = new ResizeObserver(() => {
      // Re-measure content; do NOT re-freeze cap (avoids URL-bar jitter).
      syncSize();
    });
    // Observe content, not the scrollport — avoiding feedback when we toggle overflow.
    const body = scroll.querySelector(".cm-bottom-sheet-body");
    ro.observe(body ?? scroll);

    const onOrientation = () => {
      freezeCap();
      syncSize();
    };
    window.addEventListener("orientationchange", onOrientation);

    // Fonts / late layout
    const t1 = window.setTimeout(syncSize, 50);
    const t2 = window.setTimeout(syncSize, 200);

    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", onOrientation);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [open, children, freezeCap, syncSize]);

  return (
    <div
      className={[
        "cm-bottom-sheet-root",
        open ? "cm-bottom-sheet-root--open" : "",
        debug ? "cm-bottom-sheet-root--debug" : "",
        capped ? "cm-bottom-sheet-root--capped" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={close}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal={open}
        aria-label={title ?? "メニュー"}
        className="cm-bottom-sheet"
        data-bs-capped={capped ? "1" : "0"}
        onClick={(e) => e.stopPropagation()}
      >
        <div ref={scrollRef} className="cm-bottom-sheet-scroll">
          {title ? (
            <div className="cm-bottom-sheet-header">
              <span className="cm-bottom-sheet-title">{title}</span>
              <button
                type="button"
                onClick={close}
                aria-label="閉じる"
                className="cm-bottom-sheet-close"
              >
                ✕
              </button>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                padding: "8px 16px 0",
                flexShrink: 0,
              }}
            >
              <button
                type="button"
                onClick={close}
                aria-label="閉じる"
                className="cm-bottom-sheet-close"
              >
                ✕
              </button>
            </div>
          )}
          <div className="cm-bottom-sheet-body">{children}</div>
        </div>
      </div>
    </div>
  );
}
