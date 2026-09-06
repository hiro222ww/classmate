"use client";

import { useCallback, useEffect, useRef } from "react";

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

/**
 * iOS Safari-safe bottom sheet.
 *
 * Do NOT size a `position:fixed; bottom:0` panel with `max-height` alone —
 * WebKit often stretches it to max-height and leaves a blank gap under short
 * content. Instead, dock a full-screen flex column (`justify-content:flex-end`)
 * and let the sheet be a normal flex child that hugs its content up to max-height.
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
