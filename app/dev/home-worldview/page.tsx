"use client";

import { HomeHeader } from "@/components/home/HomeHeader";
import { HomeHeroAtmosphere } from "@/components/home/HomeHeroAtmosphere";
import { HomeThemeGrid } from "@/components/home/HomeThemeGrid";
import { MyClassCard } from "@/components/home/MyClassCard";
import { MyClassEmpty } from "@/components/home/MyClassEmpty";
import { RandomTalkCta } from "@/components/home/RandomTalkCta";

/**
 * Visual fixture for home worldview polish — not production data.
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
        DEV · home worldview fixture
      </p>

      <HomeHeader displayName="ゲスト" hideWebPush />
      <HomeHeroAtmosphere />

      <section>
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
              { deviceId: "c", displayName: "C" },
            ]}
            memberCount={3}
            onOpen={() => {}}
          />
        </div>
      </section>

      <HomeThemeGrid />

      <RandomTalkCta
        onVoiceJoin={() => {}}
        onChatJoin={() => {}}
      />
    </main>
  );
}
