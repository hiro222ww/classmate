"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

/**
 * Bottom sheet layout (iOS Safari).
 *
 * White fill is painted by `.cm-bottom-sheet` (`background:#fff`).
 *
 * Remaining blank-gap cause after the prior split:
 * `.cm-bottom-sheet-scroll` still had BOTH `max-height` and `overflow-y:auto`.
 * On iOS that makes the scroll box's used height = max-height (~80vh). The
 * parent sheet is `height:auto`, so it grows with the child and the white
 * background extends far below the last row ("Googleでログイン").
 *
 * Long-press / reflow: max-height used `80dvh`, which changes when Safari
 * chrome shows/hides, so the wrongly-expanded height visibly jumped.
 *
 * Correct split:
 * - `.cm-bottom-sheet`: white bg + `max-height` + `overflow:hidden` (not auto),
 *   absolutely docked with `bottom:0` (not flex-end sizing).
 * - `.cm-bottom-sheet-scroll`: `overflow-y:auto` only — no max-height.
 *
 * Debug: append `?bsdebug=1` to outline each wrapper in a different color.
 */
export default function BottomSheet({
  open,
  onClose,
  title,
  children,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const prevOverflow = useRef("");
  const [debug, setDebug] = useState(false);

  useEffect(() => {
    try {
      setDebug(new URLSearchParams(window.location.search).get("bsdebug") === "1");
    } catch {
      setDebug(false);
    }
  }, []);

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
      className={[
        "cm-bottom-sheet-root",
        open ? "cm-bottom-sheet-root--open" : "",
        debug ? "cm-bottom-sheet-root--debug" : "",
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
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cm-bottom-sheet-scroll">
          {/* Deploy visibility marker: real DOM text (not CSS). Temporary. */}
          {debug ? (
            <div
              data-deploy-debug="0906"
              style={{
                margin: 0,
                padding: "10px 16px",
                background: "#fef08a",
                color: "#111827",
                fontSize: 16,
                fontWeight: 900,
                letterSpacing: "0.04em",
                textAlign: "center",
                borderBottom: "2px solid #ca8a04",
              }}
            >
              BUILD DEBUG 0906
            </div>
          ) : null}
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
