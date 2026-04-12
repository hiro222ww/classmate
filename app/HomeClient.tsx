"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getDeviceId } from "@/lib/device";
import { DevPanel } from "@/components/DevPanel";

type Profile = {
  device_id: string;
  display_name: string;
};

type MineClass = {
  class_id: string;
  join_ok?: boolean;
  id: string;
  name: string;
  description: string;
  world_key: string | null;
  topic_key: string | null;
  min_age: number;
  is_sensitive: boolean;
  is_user_created: boolean;
  created_at: string | null;
};

function formatClassTitle(c: MineClass): string {
  const raw = String(c.name || "").trim();
  if (raw) return raw;

  const topicKey = String(c.topic_key || "").trim();
  if (!topicKey) return "フリークラス";

  if (topicKey === "free") return "フリークラス";
  if (topicKey === "woman") return "女子校";
  if (topicKey === "man") return "男子校";

  return `${topicKey}クラス`;
}

async function readJsonSafe(res: Response) {
  const raw = await res.text().catch(() => "");
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export default function HomeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const dev = (searchParams.get("dev") ?? "").trim();
  const devQuery = dev ? `dev=${encodeURIComponent(dev)}` : "";

  const withDev = (path: string) => {
    if (!devQuery) return path;
    return `${path}${path.includes("?") ? "&" : "?"}${devQuery}`;
  };

  function buildRoomUrl(classId: string, sessionId: string) {
    const qs = new URLSearchParams({
      autojoin: "1",
      classId,
      sessionId,
    });

    if (dev) {
      qs.set("dev", dev);
    }

    return `/room?${qs.toString()}`;
  }

  const [deviceId, setDeviceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [classes, setClasses] = useState<MineClass[]>([]);
  const [error, setError] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [openingClassId, setOpeningClassId] = useState<string | null>(null);
  const [leavingClassId, setLeavingClassId] = useState<string | null>(null);

  // hydration対策: client mount後だけ DevPanel を出す
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError("");
        setProfile(null);
        setClasses([]);

        const id = getDeviceId();
        if (!cancelled) setDeviceId(id);

        const [profileRes, classesRes] = await Promise.all([
          fetch(`/api/profile?device_id=${encodeURIComponent(id)}`, {
            cache: "no-store",
          }),
          fetch(`/api/class/mine?deviceId=${encodeURIComponent(id)}`, {
            cache: "no-store",
          }),
        ]);

        if (cancelled) return;

        if (profileRes.ok) {
          const profileJson = await profileRes.json();
          setProfile(profileJson);
        } else {
          setProfile(null);
        }

        const classesJson = await classesRes.json();

        if (!classesRes.ok || !classesJson?.ok) {
          throw new Error(classesJson?.error || "class_mine_failed");
        }

        setClasses(Array.isArray(classesJson.classes) ? classesJson.classes : []);
      } catch (e: any) {
        if (!cancelled) {
          console.error("[home] load error", e);
          setError(e?.message || "読み込みに失敗しました");
          setClasses([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dev]);

  const visible = useMemo(() => {
    const arr = [...classes];
    arr.sort((a, b) => {
      const at = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bt - at;
    });
    return arr;
  }, [classes]);

  async function openClass(target: MineClass) {
    try {
      setOpeningClassId(target.id);

      const currentDeviceId = getDeviceId();

      const res = await fetch("/api/class/match-join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceId: currentDeviceId,
          classId: target.id,
          topicKey: target.topic_key,
          worldKey: target.world_key ?? "default",
          capacity: 5,
          preferJoinedClass: true,
        }),
        cache: "no-store",
      });

      const json = await readJsonSafe(res);
      console.log("[home openClass] match-join response =", json);

      if (!res.ok || !json?.ok) {
        alert(json?.error || "open_class_failed");
        return;
      }

      const classId = String(json?.classId ?? "").trim();
      const sessionId = String(json?.sessionId ?? "").trim();

      if (!classId || !sessionId) {
        alert("open_class_missing_ids");
        return;
      }

      router.push(buildRoomUrl(classId, sessionId));
    } catch (e: any) {
      console.error("[home openClass] error =", e);
      alert(e?.message || "open_class_failed");
    } finally {
      setOpeningClassId(null);
    }
  }

  async function quickJoinFreeAndOpen() {
    try {
      setQuickBusy(true);

      const currentDeviceId = getDeviceId();

      const res = await fetch("/api/class/match-join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceId: currentDeviceId,
          topicKey: null,
          worldKey: "default",
          capacity: 5,
          preferJoinedClass: false,
        }),
        cache: "no-store",
      });

      const json = await readJsonSafe(res);
      console.log("[home quick free] response =", json);

      if (!res.ok || !json?.ok) {
        alert(json?.error || "quick_join_failed");
        return;
      }

      const classId = String(json?.classId ?? "").trim();
      const sessionId = String(json?.sessionId ?? "").trim();

      if (!classId || !sessionId) {
        alert("quick_join_missing_ids");
        return;
      }

      router.push(buildRoomUrl(classId, sessionId));
    } catch (e: any) {
      console.error("[home quick free] error =", e);
      alert(e?.message || "quick_join_failed");
    } finally {
      setQuickBusy(false);
    }
  }

  async function leaveClass(target: MineClass) {
    const title = formatClassTitle(target);

    if (!confirm(`「${title}」を抜けますか？`)) {
      return;
    }

    try {
      setLeavingClassId(target.id);

      const currentDeviceId = getDeviceId();

      const res = await fetch("/api/class/leave", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceId: currentDeviceId,
          classId: target.id,
        }),
        cache: "no-store",
      });

      const raw = await res.text().catch(() => "");
      let json: any = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        json = { raw };
      }

      console.log("[home leave] status =", res.status);
      console.log("[home leave] json =", json);

      if (!res.ok || !json?.ok) {
        alert(json?.error || `leave_failed (${res.status})`);
        return;
      }

      setClasses((prev) => prev.filter((c) => String(c.id) !== String(target.id)));
    } catch (e: any) {
      console.error("[home leave] error =", e);
      alert(e?.message || "leave_failed");
    } finally {
      setLeavingClassId(null);
    }
  }

  if (loading) {
    return <p style={{ margin: 0 }}>読み込み中...</p>;
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {profile ? (
        <p style={{ margin: 0 }}>
          ようこそ、<b>{profile.display_name}</b> さん
        </p>
      ) : (
        <p style={{ margin: 0 }}>はじめにプロフィール登録が必要です。</p>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={() => router.push(withDev("/class/select"))}
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "#111",
            color: "#fff",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          はじめる（入る場所を選ぶ）
        </button>

        <button
          onClick={quickJoinFreeAndOpen}
          disabled={quickBusy}
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "#fff",
            color: "#111",
            fontWeight: 900,
            cursor: quickBusy ? "default" : "pointer",
            opacity: quickBusy ? 0.7 : 1,
          }}
        >
          {quickBusy ? "参加中…" : "フリーですぐ入る"}
        </button>

        {!profile ? (
          <button
            onClick={() => router.push(withDev("/profile"))}
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid #ddd",
              background: "#fff",
              color: "#111",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            プロフィール登録
          </button>
        ) : null}
      </div>

      <div style={{ marginTop: 6, borderTop: "1px solid #eee", paddingTop: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>自分のクラス</div>

        {error ? (
          <div style={{ color: "#dc2626", fontWeight: 800, fontSize: 13 }}>
            {error}
          </div>
        ) : visible.length === 0 ? (
          <div style={{ color: "#6b7280", fontWeight: 800, fontSize: 13 }}>
            まだありません。
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {visible.map((c) => {
              const leaving = leavingClassId === c.id;
              const opening = openingClassId === c.id;

              return (
                <div
                  key={`${c.id}`}
                  style={{
                    textAlign: "left",
                    padding: "12px 12px",
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    background: "#fff",
                  }}
                >
                  <div style={{ fontWeight: 900, color: "#111" }}>
                    {formatClassTitle(c)}
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      color: "#6b7280",
                      fontWeight: 800,
                      marginTop: 4,
                    }}
                  >
                    開くか、不要なら抜けられます
                  </div>

                  {c.description ? (
                    <div
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        fontWeight: 700,
                        marginTop: 6,
                      }}
                    >
                      {c.description}
                    </div>
                  ) : null}

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      marginTop: 10,
                    }}
                  >
                    <button
                      onClick={() => void openClass(c)}
                      disabled={opening}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #ddd",
                        background: "#111",
                        color: "#fff",
                        fontWeight: 900,
                        cursor: opening ? "default" : "pointer",
                        opacity: opening ? 0.7 : 1,
                      }}
                    >
                      {opening ? "開いています…" : "開く"}
                    </button>

                    <button
                      onClick={() => void leaveClass(c)}
                      disabled={leaving}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #fca5a5",
                        background: "#fff",
                        color: "#b91c1c",
                        fontWeight: 900,
                        cursor: leaving ? "default" : "pointer",
                        opacity: leaving ? 0.7 : 1,
                      }}
                    >
                      {leaving ? "抜けています…" : "抜ける"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {mounted ? <DevPanel deviceId={deviceId} /> : null}
    </div>
  );
}