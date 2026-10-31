"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HomeBrandVisual } from "@/components/brand/HomeBrandVisual";
import { getDeviceId } from "@/lib/device";
import { withDev } from "@/lib/withDev";
import { buildDeviceAuthHeaders } from "@/lib/fetchCurrentClass";
import {
  CLASS_CREATE_MIN_AGE,
  hasCreateClassEntitlement,
} from "@/lib/classCreateGuards";
import { useAuth } from "@/components/AuthProvider";
import { buildShellAwareLoginUrl } from "@/lib/appShellNavigation";

/**
 * Official class create (entitlement-gated).
 * Public users cannot set sensitive/premium flags; min age starts at 18.
 */
export default function ClassCreatePage() {
  const router = useRouter();
  const { status: authStatus, ready: authReady, loggedIn } = useAuth();
  const [deviceId, setDeviceId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [worldTitle, setWorldTitle] = useState("");
  const [topicTitle, setTopicTitle] = useState("");
  const [minAge, setMinAge] = useState(CLASS_CREATE_MIN_AGE);
  const [busy, setBusy] = useState(false);
  const [permLoading, setPermLoading] = useState(true);
  const [canCreate, setCanCreate] = useState(false);
  const [permError, setPermError] = useState("");

  useEffect(() => {
    setDeviceId(String(getDeviceId() ?? "").trim());
  }, []);

  useEffect(() => {
    const id = String(deviceId ?? "").trim();
    if (!id) return;

    let alive = true;
    setPermLoading(true);
    setPermError("");

    void (async () => {
      try {
        const er = await fetch("/api/user/entitlements", {
          method: "GET",
          headers: await buildDeviceAuthHeaders(id),
          cache: "no-store",
        });
        const ej = await er.json().catch(() => null);
        if (!alive) return;
        setCanCreate(hasCreateClassEntitlement(ej));
      } catch {
        if (!alive) return;
        setCanCreate(false);
        setPermError("権限情報の取得に失敗しました。");
      } finally {
        if (alive) setPermLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [deviceId]);

  async function createWorldIfNeeded(): Promise<string | null> {
    const title = worldTitle.trim();
    if (!title) return null;
    const r = await fetch("/api/class/create-world", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(await buildDeviceAuthHeaders(deviceId)),
      },
      body: JSON.stringify({
        deviceId,
        title,
        description: "",
        minAge,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.message || j?.error || "create-world failed");
    return j.worldKey as string;
  }

  async function createTopicIfNeeded(): Promise<string | null> {
    const title = topicTitle.trim();
    if (!title) return null;
    const r = await fetch("/api/class/create-topic", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(await buildDeviceAuthHeaders(deviceId)),
      },
      body: JSON.stringify({
        deviceId,
        title,
        description: "",
        minAge,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.message || j?.error || "create-topic failed");
    return j.topicKey as string;
  }

  async function createClass() {
    if (minAge < CLASS_CREATE_MIN_AGE) {
      alert(`最低年齢は${CLASS_CREATE_MIN_AGE}以上にしてください。`);
      return;
    }
    setBusy(true);
    try {
      const worldKey = await createWorldIfNeeded();
      const topicKey = await createTopicIfNeeded();

      const r = await fetch("/api/class/create", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(await buildDeviceAuthHeaders(deviceId)),
        },
        body: JSON.stringify({
          deviceId,
          name,
          description,
          worldKey: worldKey ?? "default",
          topicKey: topicKey ?? "free_talk",
          minAge,
        }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(
          j?.message ||
            j?.error ||
            "作成できません（課金権限が必要です）"
        );
        return;
      }

      alert("クラスを作成しました");
      router.push(withDev("/class/mine"));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  const showLoginGate =
    authReady && authStatus !== "loading" && !loggedIn && !permLoading;
  const showDenied = !permLoading && !canCreate && !showLoginGate;

  return (
    <main
      className="cm-classroom-scope"
      style={{
        padding: "16px 16px 28px",
        maxWidth: 720,
        margin: "0 auto",
        color: "var(--cm-text)",
      }}
    >
      <HomeBrandVisual />

      <header className="cm-page-heading" style={{ marginTop: 14 }}>
        <h1>クラス作成</h1>
        <p>権限があるアカウントのみ作成できます</p>
      </header>

      {permLoading ? (
        <section
          className="cm-paper-card"
          style={{
            marginTop: 12,
            border: "1px solid var(--cm-border, #e5eaf2)",
            borderRadius: 14,
            padding: 14,
            background: "#fff",
          }}
        >
          <p style={{ margin: 0, fontWeight: 700, color: "#64748b" }}>
            権限を確認しています…
          </p>
        </section>
      ) : null}

      {showLoginGate ? (
        <section
          className="cm-paper-card"
          style={{
            marginTop: 12,
            border: "1px solid var(--cm-border, #e5eaf2)",
            borderRadius: 14,
            padding: 14,
            display: "grid",
            gap: 12,
            background: "#fff",
          }}
        >
          <p style={{ margin: 0, fontWeight: 700 }}>
            クラスを作成するにはログインが必要です。
          </p>
          <Link
            href={buildShellAwareLoginUrl(withDev("/class/create"))}
            className="cm-cta-primary"
            style={{
              display: "inline-flex",
              justifyContent: "center",
              padding: "12px 14px",
              borderRadius: 12,
              fontWeight: 900,
              textDecoration: "none",
            }}
          >
            ログインへ
          </Link>
          <Link href={withDev("/class/select")} style={{ fontWeight: 800 }}>
            クラスを探す
          </Link>
        </section>
      ) : null}

      {showDenied ? (
        <section
          className="cm-paper-card"
          style={{
            marginTop: 12,
            border: "1px solid var(--cm-border, #e5eaf2)",
            borderRadius: 14,
            padding: 14,
            display: "grid",
            gap: 12,
            background: "#fff",
          }}
        >
          <p style={{ margin: 0, fontWeight: 700 }}>
            {permError ||
              "現在のプランではクラスを作成できません。クラス枠またはテーマ課金の契約が必要です。"}
          </p>
          <Link href={withDev("/premium")} style={{ fontWeight: 800 }}>
            プランを見る
          </Link>
          <Link href={withDev("/class/select")} style={{ fontWeight: 800 }}>
            クラスを探す
          </Link>
        </section>
      ) : null}

      {!permLoading && canCreate ? (
        <section
          className="cm-paper-card"
          style={{
            marginTop: 12,
            border: "1px solid var(--cm-border, #e5eaf2)",
            borderRadius: 14,
            padding: 14,
            display: "grid",
            gap: 12,
            background: "#fff",
          }}
        >
          <div>
            <label htmlFor="cm-create-name" style={{ fontSize: 12, fontWeight: 800 }}>
              クラス名
            </label>
            <input
              id="cm-create-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 10, marginTop: 4 }}
            />
          </div>

          <div>
            <label
              htmlFor="cm-create-description"
              style={{ fontSize: 12, fontWeight: 800 }}
            >
              説明
            </label>
            <textarea
              id="cm-create-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 10,
                height: 90,
                marginTop: 4,
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label htmlFor="cm-create-world" style={{ fontSize: 12, fontWeight: 800 }}>
                新しい世界観（任意）
              </label>
              <input
                id="cm-create-world"
                value={worldTitle}
                onChange={(e) => setWorldTitle(e.target.value)}
                placeholder="例：夜の学校"
                style={{ width: "100%", padding: 10, borderRadius: 10, marginTop: 4 }}
              />
            </div>
            <div>
              <label htmlFor="cm-create-topic" style={{ fontSize: 12, fontWeight: 800 }}>
                新しいテーマ（任意）
              </label>
              <input
                id="cm-create-topic"
                value={topicTitle}
                onChange={(e) => setTopicTitle(e.target.value)}
                placeholder="例：雑談"
                style={{ width: "100%", padding: 10, borderRadius: 10, marginTop: 4 }}
              />
            </div>
          </div>

          <div>
            <label htmlFor="cm-create-min-age" style={{ fontSize: 12, fontWeight: 800 }}>
              最低年齢（{CLASS_CREATE_MIN_AGE}以上）
            </label>
            <input
              id="cm-create-min-age"
              type="number"
              min={CLASS_CREATE_MIN_AGE}
              value={minAge}
              onChange={(e) =>
                setMinAge(
                  Math.max(CLASS_CREATE_MIN_AGE, Number(e.target.value) || CLASS_CREATE_MIN_AGE)
                )
              }
              style={{ width: "100%", padding: 10, borderRadius: 10, marginTop: 4 }}
            />
          </div>

          <button
            type="button"
            className="cm-cta-primary"
            onClick={() => void createClass()}
            disabled={busy || !name.trim() || !deviceId}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              border: "none",
              fontWeight: 900,
              cursor: busy || !name.trim() ? "default" : "pointer",
              opacity: busy || !name.trim() ? 0.7 : 1,
            }}
          >
            {busy ? "作成中…" : "作成する"}
          </button>
        </section>
      ) : null}
    </main>
  );
}
