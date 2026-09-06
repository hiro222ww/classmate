"use client";

import { useCallback, useEffect, useRef } from "react";

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

/**
 * Bottom sheet with iOS-safe sizing.
 *
 * Root cause of the home-menu blank gap on iOS Safari:
 * putting BOTH `max-height` and `overflow-y: auto` on `.cm-bottom-sheet`
 * (a flex child of the full-viewport dock) makes WebKit resolve the used
 * height to max-height (~80vh), leaving empty white space under the rows.
 *
 * Fix: outer `.cm-bottom-sheet` is content-sized only (no max-height /
 * overflow). Inner `.cm-bottom-sheet-scroll` owns max-height + scrolling.
 * `padding-bottom: env(safe-area-inset-bottom)` stays on the outer sheet
 * so the home indicator gap is preserved without creating a large spacer.
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
        <div className="cm-bottom-sheet-scroll">
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
