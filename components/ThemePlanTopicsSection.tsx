"use client";

import { useEffect, useState } from "react";
import {
  compareTopicsByDisplayOrder,
  isTopicVisibleOnBillingPage,
  THEME_PLAN_TOPICS_CHANGE_NOTE,
  THEME_PLAN_TOPICS_HEADING,
  THEME_PLAN_TOPICS_INTRO,
  topicBillingBadgeLabel,
  type TopicPublicRow,
} from "@/lib/topicManagement";

function TopicCard({ topic }: { topic: TopicPublicRow }) {
  const badge = topicBillingBadgeLabel(topic);

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: 14,
        display: "grid",
        gap: 6,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 16 }}>{topic.title}</div>
        {badge ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 900,
              padding: "3px 8px",
              borderRadius: 999,
              background: "#fef3c7",
              color: "#92400e",
            }}
          >
            {badge}
          </span>
        ) : null}
      </div>
      {topic.description ? (
        <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.65 }}>
          {topic.description}
        </p>
      ) : null}
    </div>
  );
}

export function ThemePlanTopicsSection() {
  const [topics, setTopics] = useState<TopicPublicRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/topics?for=billing", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        const rows = Array.isArray(json?.topics)
          ? (json.topics as TopicPublicRow[])
          : [];

        if (cancelled) return;

        setTopics(
          rows
            .filter(isTopicVisibleOnBillingPage)
            .sort(compareTopicsByDisplayOrder)
        );
      } catch {
        if (!cancelled) setTopics([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 18,
        padding: 16,
        background: "#fff",
        display: "grid",
        gap: 12,
      }}
    >
      <div>
        <div style={{ fontWeight: 900, fontSize: 16 }}>{THEME_PLAN_TOPICS_HEADING}</div>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "#6b7280", lineHeight: 1.65 }}>
          {THEME_PLAN_TOPICS_INTRO}
        </p>
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "#9ca3af", lineHeight: 1.6 }}>
          {THEME_PLAN_TOPICS_CHANGE_NOTE}
        </p>
      </div>

      {loading ? (
        <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>読み込み中…</p>
      ) : topics.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>
          現在公開中のテーマはありません。
        </p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {topics.map((topic) => (
            <TopicCard key={topic.topic_key} topic={topic} />
          ))}
        </div>
      )}
    </section>
  );
}
