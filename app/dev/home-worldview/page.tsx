"use client";

import { HomeHeader } from "@/components/home/HomeHeader";
import { HomePromoBanner } from "@/components/home/HomePromoBanner";
import { HomeThemeGrid } from "@/components/home/HomeThemeGrid";
import { MyClassCard } from "@/components/home/MyClassCard";
import { MyClassEmpty } from "@/components/home/MyClassEmpty";
import { RandomTalkCta } from "@/components/home/RandomTalkCta";
import { ThemeCardGrid } from "@/components/home/themeCards";

/**
 * Visual fixture for home / select worldview polish — not production data.
 * /dev/home-worldview
 */
export default function HomeWorldviewFixturePage() {
  return (
    <main
      className="cm-classroom-scope"
      style={{
        maxWidth: 430,
        margin: "0 auto",
        padding: "16px 16px 96px",
        display: "grid",
        gap: 16,
      }}
    >
      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#64748b" }}>
        DEV · home / select flow fixture
      </p>

      <HomePromoBanner
        chrome={
          <HomeHeader
            variant="onHero"
            displayName="ひろ"
            hideWebPush
            trailing={
              <button
                type="button"
                className="cm-app-header-menu-avatar"
                aria-label="メニューを開く"
              >
                <span
                  aria-hidden
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    background: "linear-gradient(180deg,#c7d2fe,#93c5fd)",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 12,
                    fontWeight: 800,
                    color: "#1e3a5f",
                  }}
                >
                  ひ
                </span>
              </button>
            }
          />
        }
      />

      <HomeThemeGrid />

      <div className="cm-home-talk-hero">
        <RandomTalkCta
          voiceBusy={false}
          chatBusy={false}
          matchJoinDisabled={false}
          onVoiceJoin={() => {}}
          onChatJoin={() => {}}
        />
      </div>

      <section className="cm-home-my-class-section">
        <div className="cm-home-section-head">
          <h2 className="cm-home-section-title">マイクラス</h2>
          <span className="cm-home-section-link">＋ 作成</span>
        </div>
        <MyClassEmpty />
      </section>

      <section>
        <div className="cm-home-section-head">
          <h2 className="cm-home-section-title">マイクラス（カード見本）</h2>
        </div>
        <div className="cm-my-class-list">
          <MyClassCard
            row={{
              classId: "fixture-1",
              name: "クラス見本",
              topicKey: "chat",
              worldKey: "default",
              topicTitle: "雑談",
              statusLabel: "通話中",
              sessionId: "fixture-session",
            }}
            members={[
              { deviceId: "a", displayName: "A" },
              { deviceId: "b", displayName: "B" },
            ]}
            onOpen={() => {}}
          />
        </div>
      </section>

      <section>
        <div className="cm-home-section-head">
          <h2 className="cm-home-section-title">テーマカード見本</h2>
        </div>
        <ThemeCardGrid />
      </section>
    </main>
  );
}
