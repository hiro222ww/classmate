"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  adminBtn,
  adminBtnGhost,
  adminCard,
  readJsonOrThrow,
} from "@/app/admin/adminUi";
import { formatJstDateTime, isoToJstWallInput } from "@/lib/experience/time";
import type { ExperienceEventRow } from "@/lib/experience/types";

export const dynamic = "force-dynamic";

type Snapshot = {
  featureEnabled: boolean;
  events: ExperienceEventRow[];
};

export default function AdminExperiencePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [featureEnabled, setFeatureEnabled] = useState(false);
  const [events, setEvents] = useState<ExperienceEventRow[]>([]);
  const [title, setTitle] = useState("期間限定の体験会");
  const [startsAtJst, setStartsAtJst] = useState("");
  const [endsAtJst, setEndsAtJst] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const j = (await readJsonOrThrow(
        await fetch("/api/admin/experience", { cache: "no-store" })
      )) as Snapshot & { ok: boolean };
      setFeatureEnabled(Boolean(j.featureEnabled));
      setEvents(Array.isArray(j.events) ? j.events : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const j = await readJsonOrThrow(
        await fetch("/api/admin/experience", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        })
      );
      if (!j?.ok) throw new Error(j?.error ?? "request_failed");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f8fafc", padding: 20 }}>
      <div style={{ maxWidth: 840, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/admin" style={{ fontWeight: 800 }}>
            ← 管理ホーム
          </Link>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>
            期間限定の体験会
          </h1>
        </div>
        <p style={{ color: "#4b5563", fontWeight: 650, lineHeight: 1.5 }}>
          暫定の集客施策です。開催予定を作成するとホームに日時が表示されます（機能は自動でON）。
          機能OFFにするとホームカードは完全非表示になります。タイムゾーンは Asia/Tokyo。
        </p>

        {error ? (
          <div style={{ ...adminCard, borderColor: "#fecaca", color: "#b91c1c" }}>
            {error}
          </div>
        ) : null}

        <section style={{ ...adminCard, marginTop: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>機能スイッチ</h2>
          <p style={{ marginTop: 0, color: "#6b7280", fontSize: 13 }}>
            現在: {featureEnabled ? "ON（表示可）" : "OFF（非表示）"}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              style={adminBtn}
              disabled={busy || featureEnabled}
              onClick={() => void post({ action: "set_feature", enabled: true })}
            >
              機能をON
            </button>
            <button
              type="button"
              style={adminBtnGhost}
              disabled={busy || !featureEnabled}
              onClick={() => void post({ action: "set_feature", enabled: false })}
            >
              機能をOFF（完全非表示）
            </button>
            <button type="button" style={adminBtnGhost} disabled={busy} onClick={() => void reload()}>
              再読込
            </button>
          </div>
        </section>

        <section style={{ ...adminCard, marginTop: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>開催を追加（JST）</h2>
          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 4, fontWeight: 700, fontSize: 13 }}>
              タイトル
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4, fontWeight: 700, fontSize: 13 }}>
              開始（JST）
              <input
                type="datetime-local"
                value={startsAtJst}
                onChange={(e) => setStartsAtJst(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4, fontWeight: 700, fontSize: 13 }}>
              終了（JST）
              <input
                type="datetime-local"
                value={endsAtJst}
                onChange={(e) => setEndsAtJst(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
              />
            </label>
            <button
              type="button"
              style={adminBtn}
              disabled={busy || !startsAtJst || !endsAtJst}
              onClick={() =>
                void post({
                  action: "create",
                  title,
                  startsAtJst,
                  endsAtJst,
                  maxMembers: 5,
                })
              }
            >
              開催予定を作成
            </button>
          </div>
        </section>

        <section style={{ ...adminCard, marginTop: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>開催一覧</h2>
          {loading ? <p>読み込み中…</p> : null}
          {!loading && events.length === 0 ? (
            <p style={{ color: "#6b7280" }}>開催予定はまだありません（初期状態）。</p>
          ) : null}
          <div style={{ display: "grid", gap: 12 }}>
            {events.map((ev) => (
              <div
                key={ev.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: 12,
                  background: "#fafafa",
                }}
              >
                <div style={{ fontWeight: 900 }}>{ev.title}</div>
                <div style={{ fontSize: 13, color: "#4b5563", marginTop: 4 }}>
                  {formatJstDateTime(ev.starts_at)} 〜 {formatJstDateTime(ev.ends_at)}（JST）
                </div>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  status={ev.status} / max={ev.max_members} / id={ev.id.slice(0, 8)}…
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  {ev.status === "scheduled" ? (
                    <button
                      type="button"
                      style={adminBtnGhost}
                      disabled={busy}
                      onClick={() => void post({ action: "cancel", id: ev.id })}
                    >
                      中止
                    </button>
                  ) : null}
                  {ev.status === "cancelled" ? (
                    <button
                      type="button"
                      style={adminBtnGhost}
                      disabled={busy}
                      onClick={() =>
                        void post({
                          action: "update",
                          id: ev.id,
                          status: "scheduled",
                          startsAtJst: isoToJstWallInput(ev.starts_at),
                          endsAtJst: isoToJstWallInput(ev.ends_at),
                        })
                      }
                    >
                      予定に戻す
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
