"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getDeviceId } from "@/lib/device";
import {
  BETA_AVAILABLE_TOPIC_PLAN,
  formatClassSlotPlanLine,
  formatClassSlotPrice,
  formatTopicPlanLine,
  tierName,
  TOPIC_PLAN_BETA_DESCRIPTION,
} from "@/lib/planTiers";
import { withDev } from "@/lib/withDev";

type Entitlements = {
  class_slots?: number;
  topic_plan?: number;
};

const TOPIC_PLANS = [400, 800, 1200] as const;
const SLOT_PLANS = [3, 5] as const;

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
  name,
  priceLine,
  description,
  active,
  disabled,
  busy,
  buttonLabel,
  onClick,
}: {
  name: string;
  priceLine: string;
  description?: string;
  active?: boolean;
  disabled?: boolean;
  busy?: boolean;
  buttonLabel: string;
  onClick: () => void;
}) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 14,
        display: "grid",
        gap: 10,
      }}
    >
      <div>
        <div style={{ fontWeight: 900, fontSize: 16 }}>{name}</div>
        <div style={{ fontWeight: 900, marginTop: 4 }}>{priceLine}</div>
        {description ? (
          <div
            style={{
              marginTop: 8,
              fontSize: 13,
              color: "#6b7280",
              lineHeight: 1.6,
            }}
          >
            {description}
          </div>
        ) : null}
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
          type="button"
          onClick={onClick}
          disabled={disabled}
          style={{
            padding: "12px",
            borderRadius: 10,
            border: "1px solid #d1d5db",
            background: "#fff",
            color: "#111",
            fontWeight: 900,
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.55 : 1,
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

  const [billingNoticeEnabled, setBillingNoticeEnabled] = useState(true);
  const [billingNoticeText, setBillingNoticeText] = useState("");

  useEffect(() => {
    setDeviceId(getDeviceId());
  }, []);

  useEffect(() => {
    if (!deviceId) return;

    (async () => {
      try {
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
      } catch {
        // silent
      }
    })();
  }, [deviceId]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/settings", {
          cache: "no-store",
        });

        const j = await r.json().catch(() => null);
        const s = j?.settings;

        if (!s) return;

        setBillingNoticeEnabled(Boolean(s.billing_notice?.enabled));
        setBillingNoticeText(String(s.billing_notice?.text ?? ""));
      } catch {
        // silent
      }
    })();
  }, []);

  const currentSlots = Number(ent?.class_slots ?? 1);
  const currentTopic = Number(ent?.topic_plan ?? 0);

  const canClick = useMemo(() => !!deviceId && !busyKey, [deviceId, busyKey]);

  async function start(body: Record<string, unknown>) {
    try {
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

      const j = await r.json().catch(() => null);

      if (j?.url) {
        window.location.href = j.url;
        return;
      }

      alert("決済ページの作成に失敗しました");
    } catch {
      alert("通信エラーが発生しました");
    } finally {
      setBusyKey("");
    }
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

      <SoftCard>
        <div style={{ fontSize: 14, color: "#666" }}>現在のテーマプラン</div>
        <div style={{ marginTop: 8, fontWeight: 900, fontSize: 18 }}>
          {currentTopic > 0 ? formatTopicPlanLine(currentTopic) : "無料"}
        </div>

        <div style={{ fontSize: 14, color: "#666", marginTop: 16 }}>
          現在のクラス枠
        </div>
        <div style={{ marginTop: 8, fontWeight: 900 }}>
          {formatClassSlotPlanLine(currentSlots)}
        </div>
      </SoftCard>

      {billingNoticeEnabled && billingNoticeText ? (
        <SoftCard>
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.8,
              color: "#666",
              whiteSpace: "pre-wrap",
            }}
          >
            {billingNoticeText}
          </div>
        </SoftCard>
      ) : null}

      <SoftCard>
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.85,
            color: "#374151",
          }}
        >
          <p style={{ margin: "0 0 10px", fontWeight: 900 }}>
            ベータ期間中はテーマプランの内容を整理中です。
          </p>
          <p style={{ margin: "0 0 8px" }}>
            現在はベーシック（¥400/月）で対象テーマを利用できます。
          </p>
          <p style={{ margin: "0 0 8px" }}>
            スタンダード・プレミアムは正式版に向けて準備中です。
          </p>
          <p style={{ margin: 0 }}>
            将来的にテーマや特典の差別化を予定しています。
          </p>
        </div>
      </SoftCard>

      <SoftCard>
        <div style={{ fontWeight: 900 }}>テーマプラン</div>

        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {TOPIC_PLANS.map((p) => {
            const purchasableInBeta = p === BETA_AVAILABLE_TOPIC_PLAN;

            return (
              <PlanCard
                key={p}
                name={tierName(p)}
                priceLine={`¥${p}/月`}
                description={TOPIC_PLAN_BETA_DESCRIPTION[p]}
                active={currentTopic === p}
                disabled={
                  !canClick ||
                  !purchasableInBeta ||
                  (purchasableInBeta && currentTopic >= p)
                }
                busy={busyKey.includes(String(p))}
                buttonLabel={purchasableInBeta ? "選ぶ" : "準備中"}
                onClick={() => start({ kind: "topic_plan", amount: p })}
              />
            );
          })}
        </div>
      </SoftCard>

      <SoftCard>
        <div style={{ fontWeight: 900 }}>クラス枠</div>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 13,
            color: "#6b7280",
            lineHeight: 1.6,
          }}
        >
          同時に参加できるクラス数の上限を拡張します。
        </p>

        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {SLOT_PLANS.map((s) => (
            <PlanCard
              key={s}
              name={`${s}クラス`}
              priceLine={formatClassSlotPrice(s)}
              active={currentSlots === s}
              disabled={!canClick || currentSlots >= s}
              busy={busyKey.includes(String(s))}
              buttonLabel="増やす"
              onClick={() => start({ kind: "slots", slotsTotal: s })}
            />
          ))}
        </div>
      </SoftCard>

      <SoftCard>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: "#374151" }}>
          プラン変更・解約は支払い管理ページから行えます。
        </p>
        <Link
          href={withDev("/billing")}
          style={{
            display: "inline-block",
            marginTop: 12,
            color: "#111",
            fontWeight: 900,
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
        >
          支払い管理へ
        </Link>
      </SoftCard>
    </main>
  );
}
