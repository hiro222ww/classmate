"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type DevPlanPreset =
  | "free"
  | "basic"
  | "standard"
  | "premium";

type DevScreen = "select" | "room" | "call";

type DevUser = {
  devKey: string;
  label: string;
  screen: DevScreen;
  classId: string;
  sessionId: string;
  planPreset: DevPlanPreset;
  classSlots: 1 | 3 | 5;
};

type DevEntitlementOverride = {
  plan: string;
  class_slots: number;
  topic_plan: number;
  can_create_classes: boolean;
  theme_pass: boolean;
};

type RuntimeStatus = {
  dev?: string;
  deviceId?: string;
  classId?: string;
  sessionId?: string;
  memberCount?: number;
  status?: string;
  page?: string;
  updatedAt?: number;
};

const DEFAULT_USERS: DevUser[] = [
  {
    devKey: "1",
    label: "user-1",
    screen: "select",
    classId: "",
    sessionId: "",
    planPreset: "free",
    classSlots: 1,
  },
  {
    devKey: "2",
    label: "user-2",
    screen: "select",
    classId: "",
    sessionId: "",
    planPreset: "premium",
    classSlots: 5,
  },
  {
    devKey: "3",
    label: "user-3",
    screen: "select",
    classId: "",
    sessionId: "",
    planPreset: "standard",
    classSlots: 3,
  },
  {
    devKey: "4",
    label: "user-4",
    screen: "select",
    classId: "",
    sessionId: "",
    planPreset: "basic",
    classSlots: 3,
  },
];

function deviceIdFromDev(devKey: string) {
  return `test-device-${devKey}`;
}

function buildEntitlement(
  preset: DevPlanPreset,
  classSlots: 1 | 3 | 5
): DevEntitlementOverride {
  if (preset === "premium") {
    return {
      plan: "topic_1200",
      class_slots: classSlots,
      topic_plan: 1200,
      can_create_classes: true,
      theme_pass: true,
    };
  }

  if (preset === "standard") {
    return {
      plan: "topic_800",
      class_slots: classSlots,
      topic_plan: 800,
      can_create_classes: classSlots > 1,
      theme_pass: false,
    };
  }

  if (preset === "basic") {
    return {
      plan: "topic_400",
      class_slots: classSlots,
      topic_plan: 400,
      can_create_classes: classSlots > 1,
      theme_pass: false,
    };
  }

  return {
    plan: "free",
    class_slots: classSlots,
    topic_plan: 0,
    can_create_classes: false,
    theme_pass: false,
  };
}

function overrideStorageKey(deviceId: string) {
  return `classmate_dev_override_${deviceId}`;
}

function saveOverride(deviceId: string, value: DevEntitlementOverride) {
  if (typeof window === "undefined") return;
  localStorage.setItem(overrideStorageKey(deviceId), JSON.stringify(value));
}

function readOverride(deviceId: string): DevEntitlementOverride | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(overrideStorageKey(deviceId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DevEntitlementOverride;
  } catch {
    return null;
  }
}

function buildFrameUrl(user: DevUser) {
  const devParam = `dev=${encodeURIComponent(user.devKey)}`;

  if (user.screen === "room" && user.classId && user.sessionId) {
    return `/room?classId=${encodeURIComponent(user.classId)}&sessionId=${encodeURIComponent(
      user.sessionId
    )}&autojoin=1&${devParam}`;
  }

  if (user.screen === "call" && user.classId && user.sessionId) {
    return `/call?classId=${encodeURIComponent(user.classId)}&sessionId=${encodeURIComponent(
      user.sessionId
    )}&${devParam}`;
  }

  return `/class/select?${devParam}`;
}

function planLabel(preset: DevPlanPreset) {
  if (preset === "premium") return "プレミアム";
  if (preset === "standard") return "スタンダード";
  if (preset === "basic") return "ベーシック";
  return "無料";
}

type DevSidebarProps = {
  users: DevUser[];
  selectedDevKey: string;
  setSelectedDevKey: React.Dispatch<React.SetStateAction<string>>;
  updateUser: (devKey: string, patch: Partial<DevUser>) => void;
  addUser: () => void;
  removeUser: (devKey: string) => void;
  refreshAll: () => void;
};

const DevSidebar = React.memo(function DevSidebar({
  users,
  selectedDevKey,
  setSelectedDevKey,
  updateUser,
  addUser,
  removeUser,
  refreshAll,
}: DevSidebarProps) {
  const selectedUser =
    users.find((u) => u.devKey === selectedDevKey) ?? users[0] ?? null;

  return (
    <section
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 14,
        display: "grid",
        gap: 12,
        alignSelf: "start",
      }}
    >
      <div>
        <div style={{ fontSize: 20, fontWeight: 900 }}>開発コンソール</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
          仮想ユーザーを同時に動かして、画面と状態を俯瞰します。
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={addUser}
          style={{
            border: "none",
            borderRadius: 10,
            padding: "10px 12px",
            background: "#111827",
            color: "#fff",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          ユーザー追加
        </button>

        <button
          onClick={refreshAll}
          style={{
            border: "1px solid #d1d5db",
            borderRadius: 10,
            padding: "10px 12px",
            background: "#fff",
            color: "#111827",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          全体更新
        </button>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {users.map((user) => {
          const selected = user.devKey === selectedDevKey;
          const override = readOverride(deviceIdFromDev(user.devKey));
          return (
            <button
              key={user.devKey}
              onClick={() => setSelectedDevKey(user.devKey)}
              style={{
                textAlign: "left",
                border: selected ? "2px solid #111827" : "1px solid #e5e7eb",
                borderRadius: 12,
                background: selected ? "#f9fafb" : "#fff",
                padding: 12,
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 900 }}>
                {user.label} / dev={user.devKey}
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                {deviceIdFromDev(user.devKey)}
              </div>
              <div style={{ marginTop: 6, fontSize: 12 }}>
                {planLabel(user.planPreset)} / slots={user.classSlots}
              </div>
              {override ? (
                <div style={{ marginTop: 4, fontSize: 11, color: "#6b7280" }}>
                  plan={override.plan} / topic={override.topic_plan}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      {selectedUser ? (
        <div
          style={{
            borderTop: "1px solid #e5e7eb",
            paddingTop: 12,
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 900 }}>
            選択中: {selectedUser.label} / dev={selectedUser.devKey}
          </div>

          <label style={{ display: "grid", gap: 6, fontSize: 12 }}>
            ラベル
            <input
              value={selectedUser.label}
              onChange={(e) =>
                updateUser(selectedUser.devKey, { label: e.target.value })
              }
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #d1d5db",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: 6, fontSize: 12 }}>
            画面
            <select
              value={selectedUser.screen}
              onChange={(e) =>
                updateUser(selectedUser.devKey, {
                  screen: e.target.value as DevScreen,
                })
              }
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                background: "#fff",
              }}
            >
              <option value="select">class/select</option>
              <option value="room">room</option>
              <option value="call">call</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6, fontSize: 12 }}>
            課金プラン
            <select
              value={selectedUser.planPreset}
              onChange={(e) =>
                updateUser(selectedUser.devKey, {
                  planPreset: e.target.value as DevPlanPreset,
                })
              }
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                background: "#fff",
              }}
            >
              <option value="free">無料</option>
              <option value="basic">ベーシック(400)</option>
              <option value="standard">スタンダード(800)</option>
              <option value="premium">プレミアム(1200)</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6, fontSize: 12 }}>
            クラス枠
            <select
              value={selectedUser.classSlots}
              onChange={(e) =>
                updateUser(selectedUser.devKey, {
                  classSlots: Number(e.target.value) as 1 | 3 | 5,
                })
              }
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                background: "#fff",
              }}
            >
              <option value={1}>1</option>
              <option value={3}>3</option>
              <option value={5}>5</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6, fontSize: 12 }}>
            classId
            <input
              value={selectedUser.classId}
              onChange={(e) =>
                updateUser(selectedUser.devKey, { classId: e.target.value })
              }
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #d1d5db",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: 6, fontSize: 12 }}>
            sessionId
            <input
              value={selectedUser.sessionId}
              onChange={(e) =>
                updateUser(selectedUser.devKey, { sessionId: e.target.value })
              }
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #d1d5db",
              }}
            />
          </label>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() =>
                updateUser(selectedUser.devKey, { screen: "select" })
              }
              style={{
                border: "1px solid #d1d5db",
                borderRadius: 10,
                padding: "10px 12px",
                background: "#fff",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              selectへ
            </button>

            <button
              onClick={() => removeUser(selectedUser.devKey)}
              style={{
                border: "1px solid #fecaca",
                borderRadius: 10,
                padding: "10px 12px",
                background: "#fff",
                color: "#991b1b",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              削除
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
});

type DevFramesProps = {
  users: DevUser[];
  refreshTick: number;
};

const DevFrames = React.memo(function DevFrames({
  users,
  refreshTick,
}: DevFramesProps) {
  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: 12,
        alignSelf: "start",
      }}
    >
      {users.map((user) => {
        const frameUrl = buildFrameUrl(user);
        return (
          <div
            key={`${user.devKey}-${refreshTick}`}
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              overflow: "hidden",
              minWidth: 0,
            }}
          >
            <div
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                background: "#fafafa",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 900 }}>
                  {user.label} / dev={user.devKey}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "#6b7280",
                    marginTop: 4,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {frameUrl}
                </div>
              </div>

              <div style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                {planLabel(user.planPreset)} / slots={user.classSlots}
              </div>
            </div>

            <iframe
              title={`dev-frame-${user.devKey}`}
              src={frameUrl}
              style={{
                width: "100%",
                height: 560,
                border: "none",
                background: "#fff",
                display: "block",
              }}
            />
          </div>
        );
      })}
    </section>
  );
});

type DevMonitorProps = {
  users: DevUser[];
  statuses: Record<string, RuntimeStatus>;
};

const DevMonitor = React.memo(function DevMonitor({
  users,
  statuses,
}: DevMonitorProps) {
  const sessionSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        sessionId: string;
        classId: string;
        devKeys: string[];
        status: string;
        memberCount: number;
      }
    >();

    for (const user of users) {
      const st = statuses[user.devKey];
      const sessionId = String(st?.sessionId ?? user.sessionId ?? "").trim();
      const classId = String(st?.classId ?? user.classId ?? "").trim();

      if (!sessionId) continue;

      if (!map.has(sessionId)) {
        map.set(sessionId, {
          sessionId,
          classId,
          devKeys: [],
          status: String(st?.status ?? "-"),
          memberCount: Number(st?.memberCount ?? 0),
        });
      }

      map.get(sessionId)!.devKeys.push(user.devKey);
    }

    return Array.from(map.values());
  }, [users, statuses]);

  return (
    <section
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 14,
        display: "grid",
        gap: 14,
        alignSelf: "start",
      }}
    >
      <div>
        <div style={{ fontSize: 18, fontWeight: 900 }}>監視パネル</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
          各仮想ユーザーの現在地とセッションの集約を表示します。
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {users.map((user) => {
          const st = statuses[user.devKey];
          return (
            <div
              key={user.devKey}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 12,
                background: "#fafafa",
              }}
            >
              <div style={{ fontWeight: 900 }}>
                {user.label} / dev={user.devKey}
              </div>
              <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.7 }}>
                <div>device: {st?.deviceId || deviceIdFromDev(user.devKey)}</div>
                <div>page: {st?.page || user.screen}</div>
                <div>class: {st?.classId || user.classId || "-"}</div>
                <div>session: {st?.sessionId || user.sessionId || "-"}</div>
                <div>members: {st?.memberCount ?? "-"}</div>
                <div>status: {st?.status || "-"}</div>
                <div>
                  plan: {planLabel(user.planPreset)} / slots={user.classSlots}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>セッション集約</div>
        {sessionSummary.length === 0 ? (
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            まだセッション情報はありません
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {sessionSummary.map((s) => (
              <div
                key={s.sessionId}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: 12,
                  background: "#fafafa",
                }}
              >
                <div style={{ fontWeight: 900 }}>session: {s.sessionId}</div>
                <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.7 }}>
                  <div>class: {s.classId || "-"}</div>
                  <div>status: {s.status || "-"}</div>
                  <div>members: {s.memberCount || "-"}</div>
                  <div>devs: {s.devKeys.join(", ")}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          borderTop: "1px solid #e5e7eb",
          paddingTop: 12,
          fontSize: 12,
          color: "#6b7280",
          lineHeight: 1.7,
        }}
      >
        ※ 課金プランの上書きは localStorage に保存しています。
        <br />
        ※ 実際に entitlements API に反映させるには、`test-device-*` のときだけこの
        override を返す処理が別途必要です。
        <br />
        ※ 各画面から `postMessage` を高頻度で送りすぎると重くなるため、この画面側では
        120ms ごとにまとめて反映しています。
      </div>
    </section>
  );
});

export default function DevConsolePage() {
  const [mounted, setMounted] = useState(false);
  const [users, setUsers] = useState<DevUser[]>(DEFAULT_USERS);
  const [statuses, setStatuses] = useState<Record<string, RuntimeStatus>>({});
  const [selectedDevKey, setSelectedDevKey] = useState("1");
  const [refreshTick, setRefreshTick] = useState(0);

  const statusBufferRef = useRef<Record<string, RuntimeStatus>>({});
  const flushTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const saved = localStorage.getItem("classmate_dev_console_users");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as DevUser[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setUsers(parsed);
        }
      } catch {}
    }
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem("classmate_dev_console_users", JSON.stringify(users));
  }, [users, mounted]);

  useEffect(() => {
    if (!mounted) return;

    for (const user of users) {
      const deviceId = deviceIdFromDev(user.devKey);
      saveOverride(deviceId, buildEntitlement(user.planPreset, user.classSlots));
    }
  }, [users, mounted]);

  useEffect(() => {
    if (!mounted) return;

    function flushBufferedStatuses() {
      const chunk = statusBufferRef.current;
      statusBufferRef.current = {};
      flushTimerRef.current = null;

      if (Object.keys(chunk).length === 0) return;

      setStatuses((prev) => ({
        ...prev,
        ...chunk,
      }));
    }

    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || data.type !== "classmate-dev-status") return;

      const payload = data.payload as RuntimeStatus;
      const devKey = String(payload?.dev ?? "").trim();
      if (!devKey) return;

      statusBufferRef.current[devKey] = {
        ...payload,
        updatedAt: Date.now(),
      };

      if (flushTimerRef.current == null) {
        flushTimerRef.current = window.setTimeout(flushBufferedStatuses, 120);
      }
    }

    window.addEventListener("message", onMessage);

    return () => {
      window.removeEventListener("message", onMessage);
      if (flushTimerRef.current != null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
  }, [mounted]);

  function updateUser(devKey: string, patch: Partial<DevUser>) {
    setUsers((prev) =>
      prev.map((u) => (u.devKey === devKey ? { ...u, ...patch } : u))
    );
  }

  function addUser() {
    const nextNum =
      users.reduce((max, u) => Math.max(max, Number(u.devKey) || 0), 0) + 1;
    const devKey = String(nextNum);

    setUsers((prev) => [
      ...prev,
      {
        devKey,
        label: `user-${devKey}`,
        screen: "select",
        classId: "",
        sessionId: "",
        planPreset: "free",
        classSlots: 1,
      },
    ]);

    setSelectedDevKey(devKey);
  }

  function removeUser(devKey: string) {
    setUsers((prev) => prev.filter((u) => u.devKey !== devKey));

    setStatuses((prev) => {
      const next = { ...prev };
      delete next[devKey];
      return next;
    });

    if (selectedDevKey === devKey) {
      const fallback = users.find((u) => u.devKey !== devKey);
      setSelectedDevKey(fallback?.devKey ?? "");
    }
  }

  function refreshAll() {
    setRefreshTick((v) => v + 1);
  }

  if (!mounted) return null;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f3f4f6",
        color: "#111827",
        padding: 12,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "320px minmax(0, 1fr) 340px",
          gap: 12,
          alignItems: "start",
        }}
      >
        <DevSidebar
          users={users}
          selectedDevKey={selectedDevKey}
          setSelectedDevKey={setSelectedDevKey}
          updateUser={updateUser}
          addUser={addUser}
          removeUser={removeUser}
          refreshAll={refreshAll}
        />

        <DevFrames users={users} refreshTick={refreshTick} />

        <DevMonitor users={users} statuses={statuses} />
      </div>
    </main>
  );
}