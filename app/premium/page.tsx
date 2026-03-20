"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getOrCreateDeviceId } from "@/lib/device";

type Entitlements = {
  plan?: string;
  class_slots?: number;
  can_create_classes?: boolean;
  topic_plan?: number; // 0/400/800/1200
};

function topicPlanLabel(amount: number) {
  if (amount >= 1200) return "プレミアム";
  if (amount >= 800) return "スタンダード";
  if (amount >= 400) return "ベーシック";
  return "無料";
}

function topicPlanShort(amount: number) {
  if (amount >= 1200) return "¥1200/月までのテーマを解放";
  if (amount >= 800) return "¥800/月までのテーマを解放";
  if (amount >= 400) return "¥400/月までのテーマを解放";
  return "無料テーマのみ利用可能";
}

function SoftCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 18,
        padding: 16,
        background: "#fff",
        ...style,
      }}
    >
      {children}
    </section>
  );
}

function PlanCard({
  title,
  subtitle,
  price,
  badge,
  active,
  disabled,
  busy,
  primary,
  buttonLabel,
  onClick,
}: {
  title: string;
  subtitle: string;
  price: string;
  badge?: string;
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
        background: "#fff",
        display: "grid",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          alignItems: "flex-start",
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#111" }}>{title}</div>
          <div
            style={{
              marginTop: 6,
              fontSize: 13,
              color: "#666",
              lineHeight: 1.6,
            }}
          >
            {subtitle}
          </div>
        </div>

        <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: "#111" }}>{price}</div>
          {badge ? (
            <div
              style={{
                marginTop: 6,
                fontSize: 11,
                fontWeight: 900,
                color: "#666",
                background: "#f3f4f6",
                borderRadius: 999,
                padding: "4px 8px",
              }}
            >
              {badge}
            </div>
          ) : null}
        </div>
      </div>

      {active ? (
        <div
          style={{
            borderRadius: 12,
            background: "#f3f4f6",
            color: "#111",
            fontSize: 13,
            fontWeight: 900,
            padding: "10px 12px",
          }}
        >
          現在利用中
        </div>
      ) : (
        <button
          onClick={onClick}
          disabled={disabled}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 12,
            border: primary ? "1px solid #111" : "1px solid #d1d5db",
            background: primary ? "#111" : "#fff",
            color: primary ? "#fff" : "#111",
            fontWeight: 900,
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.6 : 1,
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
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setDeviceId(getOrCreateDeviceId());
  }, []);

  useEffect(() => {
    if (!deviceId) return;

    (async () => {
      setMsg("");
      try {
        const r = await fetch("/api/user/entitlements", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deviceId }),
        });

        const text = await r.text();
        console.log("[entitlements] status:", r.status, "body:", text);

        let j: any = null;
        try {
          j = JSON.parse(text);
        } catch {
          j = null;
        }

        if (!r.ok) {
          console.error("entitlements error json:", j);
          setEnt(null);
          const errMsg = j?.error ?? text ?? `entitlements_failed:${r.status}`;
          setMsg(String(errMsg));
          return;
        }

        setEnt({
          plan: j?.plan ?? "free",
          class_slots: Number(j?.class_slots ?? 1),
          can_create_classes: Boolean(j?.can_create_classes ?? false),
          topic_plan: typeof j?.topic_plan === "number" ? j.topic_plan : 0,
        });
      } catch (e: any) {
        console.error(e);
        setEnt(null);
        setMsg(String(e?.message ?? "entitlements_failed"));
      }
    })();
  }, [deviceId]);

  const currentSlots = Number(ent?.class_slots ?? 1);
  const currentTopicPlan = Number(ent?.topic_plan ?? 0);

  const canClick = useMemo(() => !!deviceId && !busyKey, [deviceId, busyKey]);

  async function startCheckout(
    body:
      | { kind: "slots"; slotsTotal: 3 | 5 }
      | { kind: "topic_plan"; amount: 400 | 800 | 1200 }
  ) {
    if (!deviceId) {
      alert("deviceId が未取得です。少し待ってからもう一度押してください。");
      return;
    }

    setMsg("");
    const key =
      body.kind === "slots" ? `slots-${body.slotsTotal}` : `topic-${body.amount}`;
    setBusyKey(key);

    try {
      const r = await fetch("/api/billing/create-checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId, ...body }),
      });

      const text = await r.text();
      console.log("[checkout] status:", r.status, "body:", text);

      let j: any = null;
      try {
        j = JSON.parse(text);
      } catch {
        j = null;
      }

      if (!r.ok) {
        const errMsg = j?.error ?? text ?? "checkout_failed";
        setMsg(String(errMsg));
        alert(String(errMsg));
        return;
      }

      if (j?.url) {
        window.location.href = j.url;
        return;
      }

      setMsg("checkout url missing");
      alert("checkout url missing");
    } catch (e: any) {
      const m = String(e?.message ?? "checkout_failed");
      setMsg(m);
      alert(m);
    } finally {
      setBusyKey("");
    }
  }

  return (
    <main
      style={{
        maxWidth: 980,
        margin: "0 auto",
        padding: 16,
        color: "#111",
        display: "grid",
        gap: 16,
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>プランを見る</h1>
          <div style={{ marginTop: 8, fontSize: 14, color: "#666", lineHeight: 1.7 }}>
            classmate は、少人数で落ち着いて話すためのクラス制コミュニティです。
            <br />
            有料では <b>テーマの幅</b> と <b>所属できるクラス数</b> を広げられます。
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link
            href="/class/select"
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #d1d5db",
              background: "#fff",
              color: "#111",
              fontWeight: 900,
              textDecoration: "none",
            }}
          >
            戻る
          </Link>

          <Link
            href="/billing"
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #d1d5db",
              background: "#fff",
              color: "#111",
              fontWeight: 900,
              textDecoration: "none",
            }}
          >
            解約・支払い管理
          </Link>
        </div>
      </header>

      <SoftCard>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          <div
            style={{
              border: "1px solid #eee",
              borderRadius: 14,
              padding: 14,
              background: "#fff",
            }}
          >
            <div style={{ fontSize: 13, color: "#666", fontWeight: 800 }}>テーマプラン</div>
            <div style={{ marginTop: 8, fontSize: 18, fontWeight: 900 }}>
              {topicPlanLabel(currentTopicPlan)}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: "#666", lineHeight: 1.6 }}>
              {topicPlanShort(currentTopicPlan)}
            </div>
          </div>

          <div
            style={{
              border: "1px solid #eee",
              borderRadius: 14,
              padding: 14,
              background: "#fff",
            }}
          >
            <div style={{ fontSize: 13, color: "#666", fontWeight: 800 }}>クラス枠</div>
            <div style={{ marginTop: 8, fontSize: 18, fontWeight: 900 }}>
              {currentSlots} クラス
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: "#666", lineHeight: 1.6 }}>
              同時に所属できるクラス数
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: "#666", lineHeight: 1.7 }}>
          ※ 決済後の反映は数秒〜数十秒かかることがあります
        </div>
      </SoftCard>

      <SoftCard>
        <div style={{ fontSize: 18, fontWeight: 900 }}>何が違う？</div>

        <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 12,
          }}
        >
          <div
            style={{
              border: "1px solid #eee",
              borderRadius: 14,
              padding: 14,
            }}
          >
            <div style={{ fontWeight: 900 }}>テーマプラン</div>
            <div style={{ marginTop: 8, fontSize: 13, color: "#666", lineHeight: 1.7 }}>
              入れるテーマの範囲が広がります。
              <br />
              1テーマずつ課金するのではなく、到達したプランまでのテーマがまとめて使えます。
            </div>
          </div>

          <div
            style={{
              border: "1px solid #eee",
              borderRadius: 14,
              padding: 14,
            }}
          >
            <div style={{ fontWeight: 900 }}>クラス枠</div>
            <div style={{ marginTop: 8, fontSize: 13, color: "#666", lineHeight: 1.7 }}>
              同時に所属できるクラス数を増やします。
              <br />
              いくつかの居場所を並行して持ちたいときに使います。
            </div>
          </div>
        </div>
      </SoftCard>

      <SoftCard>
        <div style={{ fontSize: 18, fontWeight: 900 }}>テーマプラン</div>
        <div style={{ marginTop: 8, fontSize: 13, color: "#666", lineHeight: 1.7 }}>
          無料テーマに加えて、より広いテーマへ参加できるようになります。
        </div>

        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 12,
          }}
        >
          <PlanCard
            title="ベーシック"
            subtitle="まず少し広げたい人向け。400円までのテーマを解放します。"
            price="¥400 / 月"
            badge="軽く広げる"
            active={currentTopicPlan >= 400 && currentTopicPlan < 800}
            disabled={!canClick || currentTopicPlan >= 400}
            busy={busyKey === "topic-400"}
            buttonLabel="ベーシックをはじめる"
            onClick={() => startCheckout({ kind: "topic_plan", amount: 400 })}
          />

          <PlanCard
            title="スタンダード"
            subtitle="選べる幅をしっかり広げたい人向け。800円までのテーマを解放します。"
            price="¥800 / 月"
            badge="いちばん自然"
            active={currentTopicPlan >= 800 && currentTopicPlan < 1200}
            disabled={!canClick || currentTopicPlan >= 800}
            busy={busyKey === "topic-800"}
            buttonLabel="スタンダードをはじめる"
            onClick={() => startCheckout({ kind: "topic_plan", amount: 800 })}
          />

          <PlanCard
            title="プレミアム"
            subtitle="広く使いたい人向け。1200円までのテーマを解放します。"
            price="¥1200 / 月"
            badge="最大"
            active={currentTopicPlan >= 1200}
            disabled={!canClick || currentTopicPlan >= 1200}
            busy={busyKey === "topic-1200"}
            primary
            buttonLabel="プレミアムをはじめる"
            onClick={() => startCheckout({ kind: "topic_plan", amount: 1200 })}
          />
        </div>
      </SoftCard>

      <SoftCard>
        <div style={{ fontSize: 18, fontWeight: 900 }}>クラス枠</div>
        <div style={{ marginTop: 8, fontSize: 13, color: "#666", lineHeight: 1.7 }}>
          複数のクラスに同時に所属したいときに使います。
        </div>

        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 12,
          }}
        >
          <PlanCard
            title="クラス枠 3"
            subtitle="同時に 3 クラスまで所属できます。"
            price="¥700 / 月"
            badge="複数運用向け"
            active={currentSlots >= 3 && currentSlots < 5}
            disabled={!canClick || currentSlots >= 3}
            busy={busyKey === "slots-3"}
            buttonLabel="クラス枠を3まで増やす"
            onClick={() => startCheckout({ kind: "slots", slotsTotal: 3 })}
          />

          <PlanCard
            title="クラス枠 5"
            subtitle="同時に 5 クラスまで所属できます。"
            price="¥1000 / 月"
            badge="最大"
            active={currentSlots >= 5}
            disabled={!canClick || currentSlots >= 5}
            busy={busyKey === "slots-5"}
            buttonLabel="クラス枠を5まで増やす"
            onClick={() => startCheckout({ kind: "slots", slotsTotal: 5 })}
          />
        </div>
      </SoftCard>

      {msg ? (
        <div
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
            borderRadius: 14,
            padding: 12,
            fontSize: 13,
            fontWeight: 800,
            whiteSpace: "pre-wrap",
          }}
        >
          {msg}
        </div>
      ) : null}
    </main>
  );
}