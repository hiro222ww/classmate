"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import BottomSheetGeometryDebug from "@/components/BottomSheetGeometryDebug";

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
 * Debug (`?bsdebug=1`):
 * - paint hit-test around マイクラス boundary (elementsFromPoint)
 * - extreme layer colors (sheet magenta / scroll green / root blue)
 * Diagnosis only — does NOT change height / max-height / dvh / svh.
 * `?bsdebug=raw` logs the same measurements without colors, HUD, or banner.
 */
export default function BottomSheet({
  open,
  onClose,
  title,
  children,
}: BottomSheetProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const prevOverflow = useRef("");
  const [debugMode, setDebugMode] = useState<string | null>(null);
  const debug = debugMode === "1";

  useEffect(() => {
    try {
      setDebugMode(new URLSearchParams(window.location.search).get("bsdebug"));
    } catch {
      setDebugMode(null);
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
      ref={rootRef}
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
      {debug || debugMode === "raw" ? (
        <BottomSheetGeometryDebug open={open} rootRef={rootRef} showHud={debug} />
      ) : null}
    </div>
  );
}
