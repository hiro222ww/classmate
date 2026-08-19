"use client";

import Link from "next/link";
import BottomSheet from "@/components/BottomSheet";
import { BRAND_LOGO_PATH, HOME_INTRO } from "@/lib/seo";

type HomeMenuSheetProps = {
  open: boolean;
  onClose: () => void;
  notificationsEnabled: boolean;
  notificationsBusy: boolean;
  onToggleNotifications?: () => void | Promise<void>;
  hideWebPush?: boolean;
  profileHref: string;
  planHref: string;
  billingHref: string;
  accountHref: string;
  accountLabel: string;
  loggedIn: boolean;
};

function GlyphBell({ enabled }: { enabled: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      {!enabled && (
        <path d="M2 2l20 20" strokeOpacity="0.25" strokeWidth="1.6" />
      )}
    </svg>
  );
}

function GlyphUser() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function GlyphCrown() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 7l4 4 5-8 5 8 4-4v14H3V7z" />
    </svg>
  );
}

function GlyphCard() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  );
}

function GlyphGoogle() {
  return (
    <span
      aria-hidden
      style={{
        width: 22,
        height: 22,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 6,
        background:
          "conic-gradient(from 45deg, #ea4335, #fbbc05, #34a853, #4285f4, #ea4335)",
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 900, color: "#fff" }}>G</span>
    </span>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  padding: "14px 8px",
  borderBottom: "1px solid #f3f4f6",
  textDecoration: "none",
  color: "#111827",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
  background: "transparent",
  border: "none",
  width: "100%",
  textAlign: "left",
};

const chevron: React.CSSProperties = {
  marginLeft: "auto",
  color: "#9ca3af",
  fontSize: 16,
  flexShrink: 0,
};

export default function HomeMenuSheet({
  open,
  onClose,
  notificationsEnabled,
  notificationsBusy,
  onToggleNotifications,
  hideWebPush,
  profileHref,
  planHref,
  billingHref,
  accountHref,
  accountLabel,
  loggedIn,
}: HomeMenuSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="メニュー">
      <nav aria-label="設定メニュー" style={{ display: "grid" }}>
        {onToggleNotifications && !hideWebPush ? (
          <button
            type="button"
            onClick={() => {
              void onToggleNotifications();
            }}
            disabled={notificationsBusy}
            style={{
              ...rowStyle,
              cursor: notificationsBusy ? "not-allowed" : "pointer",
            }}
          >
            <GlyphBell enabled={notificationsEnabled} />
            <span>通知</span>
            <span style={chevron}>
              {notificationsEnabled ? (
                <span style={{ color: "#10b981", fontWeight: 900, fontSize: 13 }}>
                  ON
                </span>
              ) : (
                <span
                  style={{
                    color: "#ef4444",
                    fontWeight: 900,
                    fontSize: 13,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  OFF
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: "#ef4444",
                      display: "inline-block",
                    }}
                  />
                </span>
              )}
            </span>
          </button>
        ) : null}

        <Link href={profileHref} onClick={onClose} style={rowStyle}>
          <GlyphUser />
          <span>プロフィール編集</span>
          <span style={chevron}>›</span>
        </Link>

        <Link href={planHref} onClick={onClose} style={rowStyle}>
          <GlyphCrown />
          <span>プランを見る</span>
          <span style={chevron}>›</span>
        </Link>

        <Link href={billingHref} onClick={onClose} style={rowStyle}>
          <GlyphCard />
          <span>お支払い・解約</span>
          <span style={chevron}>›</span>
        </Link>

        <Link
          href={accountHref}
          onClick={onClose}
          style={{ ...rowStyle, borderBottom: "none" }}
        >
          <GlyphGoogle />
          <span>{loggedIn ? accountLabel : "Google でログイン"}</span>
          <span style={chevron}>›</span>
        </Link>
      </nav>

      {/* Brand footer in sheet */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px 8px 8px",
          marginTop: 8,
          borderTop: "1px solid #f3f4f6",
        }}
      >
        <img
          src={BRAND_LOGO_PATH}
          alt="Classmate"
          width={120}
          height={40}
          style={{
            borderRadius: 10,
            background: "#000",
            objectFit: "cover",
            flexShrink: 0,
          }}
        />
        <p
          style={{
            margin: 0,
            fontSize: 12,
            lineHeight: 1.5,
            color: "#6b7280",
            fontWeight: 600,
          }}
        >
          {HOME_INTRO}
        </p>
      </div>
    </BottomSheet>
  );
}
