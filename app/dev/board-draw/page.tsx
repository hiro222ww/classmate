"use client";

import SharedCanvasBoard from "@/app/call/SharedCanvasBoard";

/**
 * Local-only chalkboard for Playwright / manual fullscreen draw checks.
 * No Supabase — strokes stay in memory for the page lifetime.
 */
export default function BoardDrawDevPage() {
  return (
    <main
      className="cm-classroom-scope"
      style={{
        minHeight: "100dvh",
        padding: "12px 12px 24px",
        background: "#f8faff",
        boxSizing: "border-box",
      }}
    >
      <h1 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 900 }}>
        Board draw (local)
      </h1>
      <SharedCanvasBoard sessionId="local-dev-board" localOnly />
    </main>
  );
}
