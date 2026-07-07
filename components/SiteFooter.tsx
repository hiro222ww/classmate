"use client";

import Link from "next/link";
import { isAppShellContext } from "@/lib/appShellContext";

export default function SiteFooter() {
  if (isAppShellContext()) {
    return null;
  }

  return (
    <footer
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
        style={{
          display: "flex",
          gap: 16,
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        <Link href="/">Home</Link>
        <Link href="/about">About</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/guidelines">Guidelines</Link>
        <Link href="/legal/commercial-disclosure">Legal</Link>
      </div>

      <div style={{ marginTop: 8 }}>© {new Date().getFullYear()} classmate</div>
    </footer>
  );
}
