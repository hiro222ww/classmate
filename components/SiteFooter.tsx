"use client";

import Link from "next/link";
import { isAppShellContext } from "@/lib/appShellContext";

export default function SiteFooter() {
  if (isAppShellContext()) {
    return null;
  }

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
      <div
        className="cm-site-footer-links"
        style={{
          display: "flex",
          gap: 16,
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        <Link href="/">Classmateトップ</Link>
        <Link href="/about">Classmateについて</Link>
        <Link href="/terms">利用規約</Link>
        <Link href="/privacy">プライバシーポリシー</Link>
        <Link href="/guidelines">ガイドライン</Link>
        <Link href="/legal/commercial-disclosure">特定商取引法に基づく表記</Link>
      </div>

      <div className="cm-site-footer-copy" style={{ marginTop: 8 }}>
        © {new Date().getFullYear()} Classmate
      </div>
    </footer>
  );
}
