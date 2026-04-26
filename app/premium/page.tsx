"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getDeviceId } from "@/lib/device";
import { withDev } from "@/lib/withDev";

type Entitlements = {
  class_slots?: number;
  topic_plan?: number;
};

function SoftCard({ children }: { children: React.ReactNode }) {
  return (
    <section
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 18,
        padding: 16,
        background: "#fff",
      }}
    >
      {children}
    </section>
  );
}

function PlanCard({
  title,
  price,
  active,
  disabled,
  busy,
  primary,
  buttonLabel,
  onClick,
}: {
  title: string;
  price: string;
  active?: boolean;
  disabled?: boolean;
  busy?: boolean;
  primary?: boolean;
  buttonLabel: string;
  onClick: () => void;
}) {
  return (
    <div
      style={{
        border: primary ? "1px solid #111" : "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 14,
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 900 }}>{title}</div>
        <div style={{ fontWeight: 900 }}>{price}</div>
      </div>

      {active ? (
        <div
          style={{
            background: "#f3f4f6",
            padding: 10,
            borderRadius: 10,
            fontWeight: 900,
            fontSize: 13,
          }}
        >
          利用中
        </div>
      ) : (
        <button
          onClick={onClick}
          disabled={disabled}
          style={{
            padding: "12px",
            borderRadius: 10,
            border: primary ? "1px solid #111" : "1px solid #d1d5db",
            background: primary ? "#111" : "#fff",
            color: primary ? "#fff" : "#111",
            fontWeight: 900,
            opacity: disabled ? 0.5 : 1,
          }}
        >
          {busy ? "開いています…" : buttonLabel}
        </button>
      )}
    </div>
  );
}

export default function PremiumPage() {
  const [deviceId, setDeviceId] = useState("");
  const [ent, setEnt] = useState<Entitlements | null>(null);
  const [busyKey, setBusyKey] = useState("");

  useEffect(() => {
    setDeviceId(getDeviceId());
  }, []);

  useEffect(() => {
    if (!deviceId) return;

    (async () => {
      const r = await fetch("/api/user/entitlements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });

      const j = await r.json().catch(() => null);

      if (r.ok && j) {
        setEnt({
          class_slots: Number(j?.class_slots ?? 1),
          topic_plan: Number(j?.topic_plan ?? 0),
        });
      }
    })();
  }, [deviceId]);

  const currentSlots = Number(ent?.class_slots ?? 1);
  const currentTopic = Number(ent?.topic_plan ?? 0);

  const canClick = useMemo(() => !!deviceId && !busyKey, [deviceId, busyKey]);

  async function start(body: any) {
    setBusyKey(JSON.stringify(body));

    const dev =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("dev") ?? ""
        : "";

    const r = await fetch("/api/billing/create-checkout-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId, ...body, dev }),
    });

    const j = await r.json();

    if (j?.url) {
      window.location.href = j.url;
    }

    setBusyKey("");
  }

  return (
    <main
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: 16,
        display: "grid",
        gap: 16,
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>プラン</h1>

        <Link href={withDev("/billing")}>支払い管理</Link>
      </header>

      {/* 現在の状態 */}
      <SoftCard>
        <div style={{ fontSize: 14, color: "#666" }}>現在の状態</div>

        <div style={{ marginTop: 8, fontWeight: 900 }}>
          テーマ：{currentTopic || "無料"}
        </div>
        <div style={{ marginTop: 4, fontWeight: 900 }}>
          クラス枠：{currentSlots}
        </div>
      </SoftCard>

      {/* テーマ */}
      <SoftCard>
        <div style={{ fontWeight: 900 }}>テーマ</div>

        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {[400, 800, 1200].map((p) => (
            <PlanCard
              key={p}
              title={`¥${p}`}
              price="/月"
              active={currentTopic === p}
              disabled={!canClick || currentTopic >= p}
              busy={busyKey.includes(String(p))}
              primary={p === 1200}
              buttonLabel="選ぶ"
              onClick={() =>
                start({ kind: "topic_plan", amount: p })
              }
            />
          ))}
        </div>
      </SoftCard>

      {/* スロット */}
      <SoftCard>
        <div style={{ fontWeight: 900 }}>クラス枠</div>

        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {[3, 5].map((s) => (
            <PlanCard
              key={s}
              title={`${s}クラス`}
              price="/月"
              active={currentSlots === s}
              disabled={!canClick || currentSlots >= s}
              busy={busyKey.includes(String(s))}
              primary={s === 5}
              buttonLabel="増やす"
              onClick={() =>
                start({ kind: "slots", slotsTotal: s })
              }
            />
          ))}
        </div>
      </SoftCard>
    </main>
  );
}