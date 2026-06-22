"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getDeviceId } from "@/lib/device";
import { topicSupportRankFromPlan } from "@/lib/billingCatalog";
import {
  formatClassSlotPlanLine,
  formatClassSlotPrice,
  formatTopicPlanLine,
  topicSupportPlanName,
  TOPIC_PLAN_BETA_DESCRIPTION,
  TOPIC_PLAN_BETA_INTRO,
  TOPIC_PLAN_SAME_ACCESS_NOTE,
} from "@/lib/planTiers";
import { withDev } from "@/lib/withDev";
import { HelpTip } from "@/components/HelpTip";
import { BillingSupportSection } from "@/components/BillingSupportSection";
import { ThemePlanTopicsSection } from "@/components/ThemePlanTopicsSection";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { fetchAuthStatus } from "@/lib/authClient";
import { BILLING_LINK_REQUIRED_MESSAGE } from "@/lib/billingAuthGate";

type Entitlements = {
  class_slots?: number;
  topic_plan?: number;
  theme_pass?: boolean;
  plan?: string;
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
  const router = useRouter();
  const [deviceId, setDeviceId] = useState("");
  const [ent, setEnt] = useState<Entitlements | null>(null);
  const [busyKey, setBusyKey] = useState("");
  const [accountLinked, setAccountLinked] = useState<boolean | null>(null);

  useEffect(() => {
    setDeviceId(getDeviceId());
  }, []);

  useEffect(() => {
    if (!deviceId) return;

    (async () => {
      try {
        const [entRes, authStatus] = await Promise.all([
          authenticatedFetch("/api/user/entitlements", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ deviceId }),
          }),
          fetchAuthStatus(deviceId),
        ]);

        const j = await entRes.json().catch(() => null);

        if (entRes.ok && j) {
          setEnt({
            class_slots: Number(j?.class_slots ?? 1),
            topic_plan: Number(j?.topic_plan ?? 0),
            theme_pass: Boolean(j?.theme_pass),
            plan: String(j?.plan ?? ""),
          });
        }

        setAccountLinked(
          Boolean(authStatus?.hasLinkedEmail) && !Boolean(authStatus?.isAnonymous)
        );
      } catch {
        setAccountLinked(null);
      }
    })();
  }, [deviceId]);

  const currentSlots = Number(ent?.class_slots ?? 1);
  const currentTopicSupport = topicSupportRankFromPlan(ent?.plan);
  const hasThemePass = Boolean(ent?.theme_pass) || currentTopicSupport > 0;

  const canClick = useMemo(() => !!deviceId && !busyKey, [deviceId, busyKey]);

  async function openPortalUpdate(action: "update_theme" | "update_slots") {
    if (!accountLinked) {
      const ok = window.confirm(
        `${BILLING_LINK_REQUIRED_MESSAGE}\n\n設定ページへ移動しますか？`
      );
      if (ok) router.push(withDev("/settings"));
      return;
    }

    try {
      setBusyKey(action);

      const dev =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("dev") ?? ""
          : "";

      const r = await authenticatedFetch("/api/billing/create-portal-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId, dev, action }),
        cache: "no-store",
      });

      const j = await r.json().catch(() => null);

      if (j?.url) {
        window.location.href = j.url;
        return;
      }

      alert(j?.error ?? "プラン変更画面の作成に失敗しました");
    } catch {
      alert("通信エラーが発生しました");
    } finally {
      setBusyKey("");
    }
  }

  async function start(body: Record<string, unknown>) {
    if (!accountLinked) {
      const ok = window.confirm(
        `${BILLING_LINK_REQUIRED_MESSAGE}\n\n設定ページへ移動しますか？`
      );
      if (ok) router.push(withDev("/settings"));
      return;
    }

    try {
      setBusyKey(JSON.stringify(body));

      const dev =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("dev") ?? ""
          : "";

      const usePortalForTopic =
        body.kind === "topic_plan" && hasThemePass;
      const usePortalForSlots =
        body.kind === "slots" && currentSlots >= 3;

      if (usePortalForTopic) {
        await openPortalUpdate("update_theme");
        return;
      }

      if (usePortalForSlots) {
        await openPortalUpdate("update_slots");
        return;
      }

      const r = await authenticatedFetch("/api/billing/create-checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId, ...body, dev }),
      });

      const j = await r.json().catch(() => null);

      if (!r.ok && j?.error === "account_link_required") {
        alert(j.message ?? BILLING_LINK_REQUIRED_MESSAGE);
        router.push(withDev(j.redirectTo ?? "/settings"));
        return;
      }

      if (j?.url) {
        window.location.href = j.url;
        return;
      }

      if (j?.updated) {
        alert("支援プランを更新しました。");
        window.location.reload();
        return;
      }

      alert(j?.error ?? "決済ページの作成に失敗しました");
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

      {accountLinked === false ? (
        <section
          style={{
            border: "1px solid #fde68a",
            background: "#fffbeb",
            color: "#92400e",
            borderRadius: 16,
            padding: 14,
            fontSize: 13,
            lineHeight: 1.65,
            fontWeight: 700,
          }}
        >
          {BILLING_LINK_REQUIRED_MESSAGE}
          {" "}
          <Link href={withDev("/settings")} style={{ color: "#111827", fontWeight: 900 }}>
            アカウント連携
          </Link>
          {" · "}
          <Link href={withDev("/login")} style={{ color: "#111827", fontWeight: 900 }}>
            ログイン
          </Link>
        </section>
      ) : null}

      <SoftCard>
        <div style={{ fontSize: 14, color: "#666" }}>現在のテーマプラン</div>
        <div style={{ marginTop: 8, fontWeight: 900, fontSize: 18 }}>
          {hasThemePass
            ? formatTopicPlanLine(currentTopicSupport || 400)
            : "無料"}
        </div>
        {hasThemePass ? (
          <div style={{ marginTop: 8 }}>
            <HelpTip label="テーマプランの補足" content={TOPIC_PLAN_SAME_ACCESS_NOTE} />
          </div>
        ) : null}

        <div style={{ fontSize: 14, color: "#666", marginTop: 16 }}>
          現在のクラス枠
        </div>
        <div style={{ marginTop: 8, fontWeight: 900 }}>
          {formatClassSlotPlanLine(currentSlots)}
        </div>
      </SoftCard>

      <ThemePlanTopicsSection />

      <SoftCard>
        <HelpTip label="テーマプランについて" content={TOPIC_PLAN_BETA_INTRO}>
          <div style={{ fontWeight: 900 }}>テーマプラン（任意の支援額）</div>
        </HelpTip>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "#6b7280" }}>
          支援額はお好みで選べます
          <HelpTip
            label="支援額の補足"
            content={`${TOPIC_PLAN_SAME_ACCESS_NOTE} 金額が高いプランに追加機能があるわけではありません。`}
          />
        </p>

        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {TOPIC_PLANS.map((p) => {
            const isCurrentSupport = hasThemePass && currentTopicSupport === p;

            return (
              <PlanCard
                key={p}
                name={topicSupportPlanName(p)}
                priceLine={`¥${p}/月`}
                description={TOPIC_PLAN_BETA_DESCRIPTION[p]}
                active={isCurrentSupport}
                disabled={!canClick || isCurrentSupport}
                busy={busyKey.includes(String(p))}
                buttonLabel={hasThemePass ? "支援額を変更" : "この支援額で始める"}
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
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "#374151" }}>
          プラン変更・解約は「支払い管理」から行えます。
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

      <BillingSupportSection />
    </main>
  );
}
