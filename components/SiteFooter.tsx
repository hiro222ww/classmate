"use client";

import { useState } from "react";
import Link from "next/link";
import { isAppShellContext } from "@/lib/appShellContext";

export default function SiteFooter() {
  if (isAppShellContext()) {
    return null;
  }

  const [open, setOpen] = useState(false);

  const links = (
    <>
      <Link href="/">Classmateトップ</Link>
      <Link href="/about">Classmateについて</Link>
      <Link href="/terms">利用規約</Link>
      <Link href="/privacy">プライバシーポリシー</Link>
      <Link href="/guidelines">ガイドライン</Link>
      <Link href="/legal/commercial-disclosure">特定商取引法に基づく表記</Link>
    </>
  );

  return (
    <footer
      className="cm-site-footer"
      style={{
        padding: "24px 16px",
        borderTop: "1px solid #e5e7eb",
        fontSize: 12,
        color: "#6b7280",
        textAlign: "center",
        background: "#fff",
      }}
    >
      {/* Mobile: compact accordion */}
      <div className="cm-site-footer-mobile">
        <button
          type="button"
          className="cm-site-footer-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          Classmateについて
          <span aria-hidden style={{ marginLeft: 6 }}>
            {open ? "▲" : "⌄"}
          </span>
        </button>

        {open ? (
          <div
            className="cm-site-footer-links cm-site-footer-links--mobile"
            style={{
              display: "grid",
              gap: 10,
              marginTop: 12,
              justifyContent: "start",
            }}
          >
            {/*
             * href/遷移は維持する（表示だけを折りたたむ）
             */}
            <Link href="/" onClick={() => setOpen(false)}>
              Classmateトップ
            </Link>
            <Link href="/about" onClick={() => setOpen(false)}>
              Classmateについて
            </Link>
            <Link href="/terms" onClick={() => setOpen(false)}>
              利用規約
            </Link>
            <Link href="/privacy" onClick={() => setOpen(false)}>
              プライバシーポリシー
            </Link>
            <Link href="/guidelines" onClick={() => setOpen(false)}>
              ガイドライン
            </Link>
            <Link
              href="/legal/commercial-disclosure"
              onClick={() => setOpen(false)}
            >
              特定商取引法に基づく表記
            </Link>
          </div>
        ) : null}
      </div>

      {/* Desktop: horizontal links */}
      <div className="cm-site-footer-desktop">
        <div
          className="cm-site-footer-links"
          style={{
            display: "flex",
            gap: 16,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          {links}
        </div>
      </div>

      <div className="cm-site-footer-copy" style={{ marginTop: 8 }}>
        © {new Date().getFullYear()} Classmate
      </div>
    </footer>
  );
}
