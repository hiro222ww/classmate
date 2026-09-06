"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

/**
 * iOS Safari-safe bottom sheet.
 *
 * WebKit often stretches flex/`max-height` sheets to the max and leaves a blank
 * gap (and can clip later rows). We dock with flex-end, then lock an explicit
 * pixel height from measured content so the sheet always hugs its rows.
 */
export default function BottomSheet({
  open,
  onClose,
  title,
  children,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const prevOverflow = useRef("");

  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  const lockHeight = useCallback(() => {
    const sheet = sheetRef.current;
    if (!sheet || !open) return;

    // Sum direct children heights (header + body). Do NOT measure the sheet box:
    // on iOS it may already be flex-stretched to max-height, which would
    // permanently re-lock the blank gap.
    let contentH = 0;
    for (const child of Array.from(sheet.children)) {
      if (child instanceof HTMLElement) contentH += child.offsetHeight;
    }
    const padBottom =
      Number.parseFloat(getComputedStyle(sheet).paddingBottom) || 0;
    // body.scrollHeight catches content taller than the current body box
    const body = sheet.querySelector<HTMLElement>(".cm-bottom-sheet-body");
    if (body && body.scrollHeight > body.offsetHeight) {
      contentH += body.scrollHeight - body.offsetHeight;
    }

    const natural = Math.ceil(contentH + padBottom);
    const maxPx = Math.round(window.innerHeight * 0.8);
    const next = Math.max(Math.min(natural, maxPx), 1);

    sheet.style.height = `${next}px`;
    sheet.style.maxHeight = `${maxPx}px`;
    sheet.style.overflowX = "hidden";
    sheet.style.overflowY = natural > maxPx ? "auto" : "hidden";
  }, [open]);

  useEffect(() => {
    if (open) {
      prevOverflow.current = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = prevOverflow.current;
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
    if (!open) {
      const sheet = sheetRef.current;
      if (sheet) {
        sheet.style.height = "";
        sheet.style.maxHeight = "";
        sheet.style.overflow = "";
      }
      return;
    }

    lockHeight();

    const sheet = sheetRef.current;
    if (!sheet) return;

    const ro = new ResizeObserver(() => {
      lockHeight();
    });
    ro.observe(sheet);
    const body = sheet.querySelector(".cm-bottom-sheet-body");
    if (body) ro.observe(body);

    window.addEventListener("resize", lockHeight);
    window.addEventListener("orientationchange", lockHeight);

    // Re-measure after fonts/layout settle (iOS often needs a second pass).
    const t1 = window.setTimeout(lockHeight, 50);
    const t2 = window.setTimeout(lockHeight, 200);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", lockHeight);
      window.removeEventListener("orientationchange", lockHeight);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [open, children, lockHeight]);

  return (
    <div
      className={`cm-bottom-sheet-root ${open ? "cm-bottom-sheet-root--open" : ""}`}
      onClick={close}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal={open}
        aria-label={title ?? "メニュー"}
        className="cm-bottom-sheet"
        onClick={(e) => e.stopPropagation()}
      >
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
  );
}
