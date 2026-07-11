"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getDeviceId } from "@/lib/device";
import { topicSupportRankFromPlan } from "@/lib/billingCatalog";
import {
  formatClassSlotPlanLine,
  formatClassSlotPrice,
  formatTopicPlanLine,
  topicSupportPlanName,
} from "@/lib/planTiers";
import { withDev } from "@/lib/withDev";
import { HelpTip } from "@/components/HelpTip";
import { BillingNoticeTip } from "@/components/BillingNoticeTip";
import { ThemePlanTopicsSection } from "@/components/ThemePlanTopicsSection";
import BillingPageShell from "@/components/billing/BillingPageShell";
import AppShellSection from "@/components/app-shell/AppShellSection";
import { useBillingCopy } from "@/hooks/useBillingCopy";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { useRequireAccount } from "@/components/useRequireAccount";
import { resolveAuthRedirectTo } from "@/lib/appShellNavigation";
import { isAppShellContext } from "@/lib/appShellContext";

type Entitlements = {
  class_slots?: number;
  topic_plan?: number;
  theme_pass?: boolean;
  plan?: string;
};

const TOPIC_PLANS = [400, 800, 1200] as const;
const SLOT_PLANS = [3, 5] as const;

function SoftCard({
  children,
  isApp,
}: {
  children: React.ReactNode;
  isApp: boolean;
}) {
  if (isApp) {
    return <section className="app-shell-card">{children}</section>;
  }

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
  active,
  disabled,
  busy,
  buttonLabel,
  onClick,
  isApp,
}: {
  name: string;
  priceLine: string;
  active?: boolean;
  disabled?: boolean;
  busy?: boolean;
  buttonLabel: string;
  onClick: () => void;
  isApp: boolean;
}) {
  return (
    <div
      className={isApp ? "app-shell-info-box" : undefined}
      style={
        isApp
          ? { display: "grid", gap: 10 }
          : {
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              padding: 14,
              display: "grid",
              gap: 10,
            }
      }
    >
      <div>
        <div style={{ fontWeight: 900, fontSize: 16 }}>{name}</div>
        <div style={{ fontWeight: 900, marginTop: 4 }}>{priceLine}</div>
      </div>

      {active ? (
        <div
          className={isApp ? "app-shell-badge" : undefined}
          style={
            isApp
              ? { alignSelf: "flex-start" }
              : {
                  background: "#f3f4f6",
                  padding: 10,
                  borderRadius: 10,
                  fontWeight: 900,
                  fontSize: 13,
                }
          }
        >
          利用中
        </div>
      ) : (
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className={
            isApp ? "app-shell-btn app-shell-btn--primary" : undefined
          }
          style={
            isApp
              ? undefined
              : {
                  padding: "12px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  color: "#111",
                  fontWeight: 900,
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.55 : 1,
                }
          }
        >
          {busy ? "開いています…" : buttonLabel}
        </button>
      )}
    </div>
  );
}

function PremiumPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dev = (searchParams.get("dev") ?? "").trim();
  const returnTo = searchParams.get("returnTo");
  const devQuery = dev ? `?dev=${encodeURIComponent(dev)}` : "";
  const returnQuery = returnTo
    ? `${devQuery ? `${devQuery}&` : "?"}returnTo=${encodeURIComponent(returnTo)}`
    : devQuery;
  const billingHref = withDev(`/billing${returnQuery}`);

  const { ready, loggedIn } = useRequireAccount("/premium");
  const { copy } = useBillingCopy();
  const isApp = isAppShellContext();
  const [deviceId, setDeviceId] = useState("");
  const [ent, setEnt] = useState<Entitlements | null>(null);
  const [busyKey, setBusyKey] = useState("");

  useEffect(() => {
    setDeviceId(getDeviceId());
  }, []);

  useEffect(() => {
    if (!deviceId || !loggedIn) return;

    (async () => {
      try {
        const entRes = await authenticatedFetch("/api/user/entitlements", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deviceId }),
        });

        const j = await entRes.json().catch(() => null);

        if (entRes.ok && j) {
          setEnt({
            class_slots: Number(j?.class_slots ?? 1),
            topic_plan: Number(j?.topic_plan ?? 0),
            theme_pass: Boolean(j?.theme_pass),
            plan: String(j?.plan ?? ""),
          });
        }
      } catch {
        setEnt(null);
      }
    })();
  }, [deviceId, loggedIn]);

  const currentSlots = Number(ent?.class_slots ?? 1);
  const currentTopicSupport = topicSupportRankFromPlan(ent?.plan);
  const hasThemePass = Boolean(ent?.theme_pass) || currentTopicSupport > 0;

  const canClick = useMemo(() => !!deviceId && !busyKey, [deviceId, busyKey]);

  async function openPortalUpdate(action: "update_theme" | "update_slots") {
    try {
      setBusyKey(action);

      const r = await authenticatedFetch("/api/billing/create-portal-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId, dev, action }),
        cache: "no-store",
      });

      const j = await r.json().catch(() => null);

      if (!r.ok && (j?.error === "auth_required" || j?.redirectTo)) {
        router.push(withDev(resolveAuthRedirectTo(j?.redirectTo, "/premium")));
        return;
      }

      if (j?.url) {
        window.location.href = j.url;
        return;
      }

      alert(j?.message ?? j?.error ?? "プラン変更画面の作成に失敗しました");
    } catch {
      alert("通信エラーが発生しました");
    } finally {
      setBusyKey("");
    }
  }

  async function start(body: Record<string, unknown>) {
    try {
      setBusyKey(JSON.stringify(body));

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

      if (!r.ok && (j?.error === "auth_required" || j?.redirectTo)) {
        router.push(withDev(resolveAuthRedirectTo(j?.redirectTo, "/premium")));
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

      alert(j?.message ?? j?.error ?? "決済ページの作成に失敗しました");
    } catch {
      alert("通信エラーが発生しました");
    } finally {
      setBusyKey("");
    }
  }

  if (!ready || !loggedIn) {
    return (
      <main
        className={isApp ? "app-immersive-inner" : undefined}
        style={isApp ? undefined : { padding: 24 }}
      >
        読み込み中…
      </main>
    );
  }

  const currentPlanSection = (
    <SoftCard isApp={isApp}>
      <div className={isApp ? "app-shell-muted" : undefined} style={isApp ? undefined : { fontSize: 14, color: "#666" }}>
        現在のテーマプラン
      </div>
      <div style={{ marginTop: 8, fontWeight: 900, fontSize: 18 }}>
        {hasThemePass
          ? formatTopicPlanLine(currentTopicSupport || 400)
          : "無料"}
      </div>

      <div
        className={isApp ? "app-shell-muted" : undefined}
        style={isApp ? { marginTop: 16 } : { fontSize: 14, color: "#666", marginTop: 16 }}
      >
        現在のクラス枠
      </div>
      <div style={{ marginTop: 8, fontWeight: 900 }}>
        {formatClassSlotPlanLine(currentSlots)}
      </div>
    </SoftCard>
  );

  const topicPlanSection = isApp ? (
    <AppShellSection title={copy.premium.topicPlanSectionTitle}>
      <HelpTip
        label={copy.premium.topicPlanHelpLabel}
        content={copy.premium.topicPlanHelp}
      >
        <p className="app-shell-muted" style={{ margin: "0 0 12px" }}>
          テーマプランの説明
        </p>
      </HelpTip>
      <div style={{ display: "grid", gap: 10 }}>
        {TOPIC_PLANS.map((p) => {
          const isCurrentSupport = hasThemePass && currentTopicSupport === p;
          return (
            <PlanCard
              key={p}
              isApp={isApp}
              name={topicSupportPlanName(p)}
              priceLine={`¥${p}/月`}
              active={isCurrentSupport}
              disabled={!canClick || isCurrentSupport}
              busy={busyKey.includes(String(p))}
              buttonLabel={hasThemePass ? "支援額を変更" : "この支援額で始める"}
              onClick={() => start({ kind: "topic_plan", amount: p })}
            />
          );
        })}
      </div>
    </AppShellSection>
  ) : (
    <SoftCard isApp={isApp}>
      <HelpTip
        label={copy.premium.topicPlanHelpLabel}
        content={copy.premium.topicPlanHelp}
      >
        <div style={{ fontWeight: 900 }}>{copy.premium.topicPlanSectionTitle}</div>
      </HelpTip>

      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        {TOPIC_PLANS.map((p) => {
          const isCurrentSupport = hasThemePass && currentTopicSupport === p;
          return (
            <PlanCard
              key={p}
              isApp={isApp}
              name={topicSupportPlanName(p)}
              priceLine={`¥${p}/月`}
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
  );

  const slotPlanSection = isApp ? (
    <AppShellSection title={copy.premium.classSlotSectionTitle}>
      <HelpTip
        label={copy.premium.classSlotHelpLabel}
        content={copy.premium.classSlotHelp}
      >
        <p className="app-shell-muted" style={{ margin: "0 0 12px" }}>
          クラス枠の説明
        </p>
      </HelpTip>
      <div style={{ display: "grid", gap: 10 }}>
        {SLOT_PLANS.map((s) => (
          <PlanCard
            key={s}
            isApp={isApp}
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
    </AppShellSection>
  ) : (
    <SoftCard isApp={isApp}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 900 }}>{copy.premium.classSlotSectionTitle}</div>
        <HelpTip
          label={copy.premium.classSlotHelpLabel}
          content={copy.premium.classSlotHelp}
        />
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        {SLOT_PLANS.map((s) => (
          <PlanCard
            key={s}
            isApp={isApp}
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
  );

  return (
    <BillingPageShell
      title="プラン"
      notice={<BillingNoticeTip />}
      headerAction={
        <Link
          href={billingHref}
          className={isApp ? "app-shell-btn app-shell-btn--ghost" : undefined}
          style={isApp ? undefined : { fontWeight: 900 }}
        >
          支払い管理
        </Link>
      }
    >
      {currentPlanSection}
      <ThemePlanTopicsSection />
      {topicPlanSection}
      {slotPlanSection}
    </BillingPageShell>
  );
}

export default function PremiumPage() {
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>読み込み中...</main>}>
      <PremiumPageInner />
    </Suspense>
  );
}
