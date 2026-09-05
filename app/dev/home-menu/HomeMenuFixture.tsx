"use client";

import { useState } from "react";
import HomeMenuSheet from "@/components/HomeMenuSheet";

/**
 * Presentational fixture for verifying the home hamburger menu sheet
 * hugs content height (no large empty gap) on mobile viewports.
 */
export default function HomeMenuFixture() {
  const [open, setOpen] = useState(true);

  return (
    <main
      className="cm-classroom-scope"
      style={{ minHeight: "100vh", padding: 16, background: "#eef6ff" }}
    >
      <h1 style={{ margin: 0, fontSize: 18 }}>home-menu fixture</h1>
      <p style={{ color: "#64748b", fontSize: 13 }}>
        Opens the hamburger menu sheet for layout checks.
      </p>
      <button type="button" className="cm-hamburger-btn" onClick={() => setOpen(true)}>
        メニューを開く
      </button>
      <HomeMenuSheet
        open={open}
        onClose={() => setOpen(false)}
        notificationsEnabled={false}
        notificationsBusy={false}
        onToggleNotifications={() => undefined}
        profileHref="/profile"
        myClassesHref="/class/mine"
        planHref="/premium"
        billingHref="/billing"
        accountHref="/settings"
        accountLabel="設定"
        loggedIn
        aboutHref="/about"
        legalHref="/terms"
      />
    </main>
  );
}
