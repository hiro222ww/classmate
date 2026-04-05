"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getDeviceId } from "@/lib/device";

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

function buildRoomUrl(classId: string, sessionId: string) {
  const qs = new URLSearchParams({
    autojoin: "1",
    classId,
    sessionId,
  });
  return `/room?${qs.toString()}`;
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

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [classes, setClasses] = useState<MineClass[]>([]);
  const [error, setError] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [openingClassId, setOpeningClassId] = useState<string | null>(null);
  const [leavingClassId, setLeavingClassId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError("");

        const deviceId = getDeviceId();

        const [profileRes, classesRes] = await Promise.all([
          fetch(`/api/profile?device_id=${encodeURIComponent(deviceId)}`, {
            cache: "no-store",
          }),
          fetch(`/api/class/mine?deviceId=${encodeURIComponent(deviceId)}`, {
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
          setError(e?.message || "読み込みに失敗しました");
          setClasses([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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

      const deviceId = getDeviceId();

      const res = await fetch("/api/class/match-join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceId,
          classId: target.class_id || target.id,
          topicKey: target.topic_key,
          worldKey: target.world_key ?? "default",
          capacity: 5,
          preferJoinedClass: true,
        }),
      });

      const json = await readJsonSafe(res);

      if (!res.ok || !json?.ok) {
        alert(json?.error || "open_class_failed");
        return;
      }

      router.push(buildRoomUrl(json.classId, json.sessionId));
    } finally {
      setOpeningClassId(null);
    }
  }

  async function quickJoinFreeAndOpen() {
    try {
      setQuickBusy(true);

      const deviceId = getDeviceId();

      const res = await fetch("/api/class/match-join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceId,
          topicKey: null,
          worldKey: "default",
          capacity: 5,
        }),
      });

      const json = await readJsonSafe(res);

      if (!res.ok || !json?.ok) {
        alert(json?.error || "quick_join_failed");
        return;
      }

      router.push(buildRoomUrl(json.classId, json.sessionId));
    } finally {
      setQuickBusy(false);
    }
  }

  async function leaveClass(target: MineClass) {
    try {
      setLeavingClassId(target.id);

      const deviceId = getDeviceId();

      await fetch("/api/class/leave", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceId,
          classId: target.class_id || target.id,
        }),
      });

      setClasses((prev) =>
        prev.filter((c) => c.class_id !== target.class_id)
      );
    } finally {
      setLeavingClassId(null);
    }
  }

  if (loading) return <p>読み込み中...</p>;

  return (
    <div>
      <button onClick={() => router.push("/class/select")}>
        クラス選択
      </button>
    </div>
  );
}