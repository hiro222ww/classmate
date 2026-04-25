"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  topic_title?: string | null;
  topic_description?: string | null;
  min_age: number;
  is_sensitive: boolean;
  is_user_created: boolean;
  created_at: string | null;

  match_deadline_at?: string | null;
  has_active_session?: boolean;
  session_id?: string | null;
  session_status?: string | null;
  session_created_at?: string | null;
};

type ClassMember = {
  device_id: string;
  display_name: string;
  photo_path?: string | null;
  joined_at?: string | null;
};

type PresenceStatus = "offline" | "waiting" | "active";

type PresenceRow = {
  device_id: string;
  status: PresenceStatus;
  session_id?: string | null;
  updated_at?: string | null;
};

type ClassMessage = {
  id: number;
  class_id: string;
  device_id: string;
  message: string;
  msg_type?: string | null;
  created_at?: string | null;
};

function formatClassLabel(c: MineClass): string {
  const raw = String(c.name || "").trim();
  if (!raw) return "クラス";

  const match = raw.match(/クラス\d+[A-Z]/);
  return match ? match[0] : raw;
}

async function readJsonSafe(res: Response) {
  const raw = await res.text().catch(() => "");
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function getEffectiveStatus(p?: PresenceRow): PresenceStatus {
  if (!p?.updated_at) return "offline";

  const t = new Date(p.updated_at).getTime();
  if (!Number.isFinite(t)) return "offline";

  const diff = Date.now() - t;

  if (diff > 10000) return "offline";

  if (p.status === "active") return "active";
  if (p.status === "waiting") return "waiting";
  return "offline";
}

function statusLabel(status: PresenceStatus) {
  if (status === "active") return "通話中";
  if (status === "waiting") return "オンライン";
  return "オフライン";
}

function statusStyle(status: PresenceStatus) {
  if (status === "active") {
    return {
      background: "#dcfce7",
      color: "#166534",
      border: "1px solid #86efac",
    };
  }

  if (status === "waiting") {
    return {
      background: "#fef3c7",
      color: "#92400e",
      border: "1px solid #fcd34d",
    };
  }

  return {
    background: "#f3f4f6",
    color: "#6b7280",
    border: "1px solid #d1d5db",
  };
}

function getClassStatusLabel(c: MineClass) {
  const sessionStatus = String(c.session_status ?? "").trim();
  const hasActiveSession = Boolean(c.has_active_session);

  if (sessionStatus === "active") {
    return "通話中";
  }

  const deadlineMs = c.match_deadline_at
    ? new Date(c.match_deadline_at).getTime()
    : NaN;

  if (Number.isFinite(deadlineMs)) {
    if (deadlineMs > Date.now() && hasActiveSession) {
      return "募集中";
    }
    if (deadlineMs <= Date.now()) {
      return "募集締切";
    }
  }

  if (hasActiveSession) {
    return "待機中";
  }

  return "休止中";
}

function getClassStatusStyle(label: string) {
  if (label === "通話中") {
    return {
      background: "#dcfce7",
      color: "#166534",
      border: "1px solid #86efac",
    };
  }

  if (label === "募集中") {
    return {
      background: "#dbeafe",
      color: "#1d4ed8",
      border: "1px solid #93c5fd",
    };
  }

  if (label === "募集締切") {
    return {
      background: "#f3f4f6",
      color: "#6b7280",
      border: "1px solid #d1d5db",
    };
  }

  if (label === "待機中") {
    return {
      background: "#fef3c7",
      color: "#92400e",
      border: "1px solid #fcd34d",
    };
  }

  return {
    background: "#f9fafb",
    color: "#6b7280",
    border: "1px solid #e5e7eb",
  };
}

async function ensureNotificationPermission() {
  if (typeof window === "undefined") return false;
  if (!("Notification" in window)) return false;

  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;

  const result = await Notification.requestPermission();
  return result === "granted";
}

function pushBrowserNotification(
  enabled: boolean,
  title: string,
  body: string
) {
  if (!enabled) return;
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  new Notification(title, { body });
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

  const [membersByClass, setMembersByClass] = useState<Record<string, ClassMember[]>>({});
  const [presenceByClass, setPresenceByClass] = useState<
    Record<string, Record<string, PresenceRow>>
  >({});
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  const prevPresenceRef = useRef<Record<string, Record<string, PresenceRow>>>({});
  const prevMessageIdsRef = useRef<Record<string, number>>({});

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("notifications_enabled");
      setNotificationsEnabled(saved === "true");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError("");
        setProfile(null);
        setClasses([]);
        setMembersByClass({});
        setPresenceByClass({});

        const id = String(getDeviceId() ?? "").trim();

        if (!cancelled) setDeviceId(id);

        if (!id) {
          console.warn("[home] deviceId missing on init");
          setProfile(null);
          setClasses([]);
          setError("device_id_missing");
          return;
        }

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
          const profileJson = await readJsonSafe(profileRes);
          const nextProfile =
            profileJson?.profile && typeof profileJson.profile === "object"
              ? profileJson.profile
              : profileJson?.device_id
                ? profileJson
                : null;

          setProfile(nextProfile);
        } else {
          setProfile(null);
        }

        const classesJson = await readJsonSafe(classesRes);

        if (!classesRes.ok || !classesJson?.ok) {
          throw new Error(classesJson?.error || "class_mine_failed");
        }

        const nextClasses = Array.isArray(classesJson.classes)
          ? classesJson.classes
          : [];

        setClasses((prev) => {
          if (prev.length > 0 && nextClasses.length === 0) {
            console.warn("[home] ignore empty classes snapshot once");
            return prev;
          }
          return nextClasses;
        });
      } catch (e: any) {
        console.error("[home] load error", e);
        if (!cancelled) {
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

  useEffect(() => {
    if (!deviceId) return;
    if (!classes.length) return;

    const timer = window.setInterval(() => {
      classes.forEach((c) => {
        fetch("/api/class/presence", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            classId: c.id,
            deviceId,
            screen: "home",
            sessionId: null,
          }),
          cache: "no-store",
        }).catch((e) => {
          console.warn("[home] presence heartbeat failed", c.id, e);
        });
      });
    }, 5000);

    classes.forEach((c) => {
      fetch("/api/class/presence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classId: c.id,
          deviceId,
          screen: "home",
          sessionId: null,
        }),
        cache: "no-store",
      }).catch((e) => {
        console.warn("[home] initial presence heartbeat failed", c.id, e);
      });
    });

    return () => {
      window.clearInterval(timer);
    };
  }, [deviceId, classes]);

  useEffect(() => {
    if (!classes.length) return;

    let cancelled = false;

    async function loadMembersAndPresence() {
      const classIds = classes.map((c) => c.id).filter(Boolean);

      try {
        const results = await Promise.all(
          classIds.map(async (classId) => {
            const [membersRes, presenceRes] = await Promise.all([
              fetch(`/api/class/members?classId=${encodeURIComponent(classId)}`, {
                cache: "no-store",
              }),
              fetch(`/api/class/presence?classId=${encodeURIComponent(classId)}`, {
                cache: "no-store",
              }),
            ]);

            const membersJson = await readJsonSafe(membersRes);
            const presenceJson = await readJsonSafe(presenceRes);

            return {
              classId,
              members: Array.isArray(membersJson?.members) ? membersJson.members : [],
              presence: Array.isArray(presenceJson?.presence) ? presenceJson.presence : [],
            };
          })
        );

        if (cancelled) return;

        const nextMembersByClass: Record<string, ClassMember[]> = {};
        const nextPresenceByClass: Record<string, Record<string, PresenceRow>> = {};

        for (const row of results) {
          nextMembersByClass[row.classId] = row.members;

          const presenceMap: Record<string, PresenceRow> = {};
          for (const p of row.presence) {
            const key = String(p.device_id ?? "").trim();
            if (!key) continue;
            presenceMap[key] = p;
          }
          nextPresenceByClass[row.classId] = presenceMap;
        }

        const prev = prevPresenceRef.current;

        for (const c of classes) {
          const classId = c.id;
          const classTitle = formatClassLabel(c);
          const currentPresenceMap = nextPresenceByClass[classId] ?? {};
          const prevPresenceMap = prev[classId] ?? {};
          const members = nextMembersByClass[classId] ?? [];

          for (const member of members) {
            const memberId = String(member.device_id ?? "").trim();
            if (!memberId || memberId === deviceId) continue;

            const prevStatus = getEffectiveStatus(prevPresenceMap[memberId]);
            const nextStatus = getEffectiveStatus(currentPresenceMap[memberId]);

            if (prevStatus !== "active" && nextStatus === "active") {
              pushBrowserNotification(
                notificationsEnabled,
                "通話が始まりました",
                `${member.display_name}さんが「${classTitle}」で通話中です`
              );
            }

            if (
              prevStatus === "offline" &&
              (nextStatus === "waiting" || nextStatus === "active")
            ) {
              pushBrowserNotification(
                notificationsEnabled,
                "クラスメートがオンラインになりました",
                `${member.display_name}さんが「${classTitle}」に来ています`
              );
            }
          }
        }

        prevPresenceRef.current = nextPresenceByClass;
        setMembersByClass(nextMembersByClass);
        setPresenceByClass(nextPresenceByClass);
      } catch (e) {
        console.error("[home] members/presence load failed", e);
      }
    }

    void loadMembersAndPresence();
    const timer = window.setInterval(loadMembersAndPresence, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [classes, deviceId, notificationsEnabled]);

  useEffect(() => {
    if (!classes.length || !deviceId) return;

    let cancelled = false;

    async function pollMessages() {
      try {
        const results = await Promise.all(
          classes.map(async (c) => {
            const res = await fetch("/api/class/messages", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                classId: c.id,
                limit: 20,
              }),
              cache: "no-store",
            });

            const json = await readJsonSafe(res);

            return {
              classId: c.id,
              classTitle: formatClassLabel(c),
              messages: Array.isArray(json?.messages) ? json.messages : [],
            };
          })
        );

        if (cancelled) return;

        for (const row of results) {
          const messages = row.messages as ClassMessage[];
          if (!messages.length) continue;

          const latest = messages[messages.length - 1];
          const latestId = Number(latest?.id ?? 0);
          const prevId = Number(prevMessageIdsRef.current[row.classId] ?? 0);

          if (!prevId) {
            prevMessageIdsRef.current[row.classId] = latestId;
            continue;
          }

          if (latestId > prevId) {
            const newMessages = messages.filter((m) => Number(m.id) > prevId);

            for (const msg of newMessages) {
              const senderId = String(msg.device_id ?? "").trim();
              if (!senderId || senderId === deviceId) continue;

              const members = membersByClass[row.classId] ?? [];
              const sender =
                members.find((m) => m.device_id === senderId)?.display_name ||
                "クラスメート";

              const body =
                String(msg.message ?? "").trim() || "新しいメッセージがあります";

              pushBrowserNotification(
                notificationsEnabled,
                `新着メッセージ（${row.classTitle}）`,
                `${sender}: ${body}`
              );
            }

            prevMessageIdsRef.current[row.classId] = latestId;
          }
        }
      } catch (e) {
        console.error("[home] message polling failed", e);
      }
    }

    void pollMessages();
    const timer = window.setInterval(pollMessages, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [classes, deviceId, membersByClass, notificationsEnabled]);

  const visible = useMemo(() => {
    const byId = new Map<string, MineClass>();

    for (const c of classes) {
      const id = String(c.id ?? "").trim();
      if (!id) continue;

      const prev = byId.get(id);
      const prevTime = prev?.created_at ? new Date(prev.created_at).getTime() : 0;
      const nextTime = c.created_at ? new Date(c.created_at).getTime() : 0;

      if (!prev || nextTime >= prevTime) {
        byId.set(id, c);
      }
    }

    const arr = Array.from(byId.values());
    arr.sort((a, b) => {
      const at = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bt - at;
    });
    return arr;
  }, [classes]);

  const welcomeName = String(profile?.display_name ?? "").trim() || "ゲスト";

  async function toggleNotifications() {
    if (typeof window === "undefined") return;

    if (!("Notification" in window)) {
      alert("このブラウザは通知に対応していません");
      return;
    }

    if (notificationsEnabled) {
      localStorage.setItem("notifications_enabled", "false");
      setNotificationsEnabled(false);
      return;
    }

    const ok = await ensureNotificationPermission();

    if (!ok) {
      alert("通知が許可されていません。ブラウザ設定を確認してください。");
      return;
    }

    localStorage.setItem("notifications_enabled", "true");
    setNotificationsEnabled(true);
  }

  async function openClass(target: MineClass) {
    try {
      setOpeningClassId(target.id);

      const currentDeviceId = String(getDeviceId() ?? "").trim();
      if (!currentDeviceId) {
        alert("device_id_missing");
        return;
      }

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
  if (json?.error === "class_slots_limit") {
    alert(
      `クラス参加上限に達しています。現在のプランでは最大 ${
        json?.classSlots ?? "指定"
      } クラスまで参加できます。不要なクラスを抜けるか、プランを変更してください。`
    );
    return;
  }

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

      const currentDeviceId = String(getDeviceId() ?? "").trim();
      if (!currentDeviceId) {
        alert("device_id_missing");
        return;
      }

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
  if (json?.error === "class_slots_limit") {
    alert(
      `クラス参加上限に達しています。現在のプランでは最大 ${
        json?.classSlots ?? "指定"
      } クラスまで参加できます。不要なクラスを抜けるか、プランを変更してください。`
    );
    return;
  }

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
    const title = formatClassLabel(target);

    if (!confirm(`「${title}」を抜けますか？`)) {
      return;
    }

    try {
      setLeavingClassId(target.id);

      const currentDeviceId = String(getDeviceId() ?? "").trim();
      if (!currentDeviceId) {
        alert("device_id_missing");
        return;
      }

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
      setMembersByClass((prev) => {
        const next = { ...prev };
        delete next[target.id];
        return next;
      });
      setPresenceByClass((prev) => {
        const next = { ...prev };
        delete next[target.id];
        return next;
      });
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
      <p style={{ margin: 0 }}>
        ようこそ、<b>{welcomeName}</b> さん
      </p>

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

        <button
          onClick={() => void toggleNotifications()}
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            border: "1px solid #ddd",
            background: notificationsEnabled ? "#dcfce7" : "#fff",
            color: "#111",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          {notificationsEnabled ? "通知OFF" : "通知を有効化"}
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
              const members = membersByClass[c.id] ?? [];
              const presenceMap = presenceByClass[c.id] ?? {};
              const classLabel = formatClassLabel(c);
              const classStatusLabel = getClassStatusLabel(c);
              const classStatusPill = getClassStatusStyle(classStatusLabel);

              return (
                <div
                  key={`${c.id}`}
                  style={{
                    textAlign: "left",
                    padding: "14px 14px",
                    borderRadius: 14,
                    border: "1px solid #ddd",
                    background: "#fff",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 900,
                        color: "#111",
                        fontSize: 24,
                        lineHeight: 1.2,
                        letterSpacing: "0.02em",
                      }}
                    >
                      {classLabel}
                    </div>

                    <span
                      style={{
                        ...classStatusPill,
                        fontSize: 12,
                        fontWeight: 900,
                        padding: "6px 10px",
                        borderRadius: 999,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {classStatusLabel}
                    </span>
                  </div>

                  {c.description ? (
                    <div
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        fontWeight: 700,
                        marginTop: 8,
                      }}
                    >
                      {c.description}
                    </div>
                  ) : null}

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#111" }}>
                      クラスメート
                    </div>

                    {members.length === 0 ? (
                      <div
                        style={{
                          fontSize: 12,
                          color: "#6b7280",
                          marginTop: 6,
                        }}
                      >
                        まだ表示できるクラスメートがいません
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                        {members.map((m) => {
                          const isMe = m.device_id === deviceId;
                          const rawPresence = presenceMap[m.device_id];
                          const presence = getEffectiveStatus(rawPresence);
                          const pill = statusStyle(presence);

                          return (
                            <div
                              key={`${c.id}-${m.device_id}`}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: 8,
                                padding: "8px 10px",
                                borderRadius: 10,
                                background: "#fafafa",
                                border: "1px solid #eee",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 13,
                                  fontWeight: 800,
                                  color: "#111",
                                }}
                              >
                                {m.display_name || "メンバー"}
                                {isMe ? "（あなた）" : ""}
                              </div>

                              <span
                                style={{
                                  ...pill,
                                  fontSize: 11,
                                  fontWeight: 900,
                                  padding: "4px 8px",
                                  borderRadius: 999,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {statusLabel(presence)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      marginTop: 12,
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