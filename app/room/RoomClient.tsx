"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChalkboardRoomShell } from "./ChalkboardRoomShell";
import { supabase } from "@/lib/supabaseClient";
import { getOrCreateDeviceId } from "@/lib/device";
import { pushRecentClass } from "@/lib/recentClasses";

type MemberRow = {
  device_id?: string;
  display_name: string;
  joined_at: string;
};

type RoomMessage = {
  id: string;
  session_id: string;
  device_id: string;
  display_name: string;
  message: string;
  created_at: string;
};

function dedupeMembers(
  list: MemberRow[],
  myDeviceId: string,
  myDisplayName: string
): MemberRow[] {
  const normalizedMyDeviceId = String(myDeviceId ?? "").trim();
  const normalizedMyName = String(myDisplayName ?? "").trim();

  const result: MemberRow[] = [];
  const byDevice = new Map<string, MemberRow>();

  let bestMe: MemberRow | null = null;

  for (const m of list) {
    const did = String(m.device_id ?? "").trim();
    const name = String(m.display_name ?? "").trim();

    const isMe =
      (did && did === normalizedMyDeviceId) ||
      (!did && (name === "You" || name === normalizedMyName));

    if (isMe) {
      if (!bestMe) {
        bestMe = {
          device_id: did || normalizedMyDeviceId,
          display_name: name && name !== "You" ? name : normalizedMyName || "You",
          joined_at: m.joined_at,
        };
      } else {
        const prevName = bestMe.display_name;

        if ((prevName === "You" || !prevName) && name && name !== "You") {
          bestMe = {
            device_id: did || normalizedMyDeviceId,
            display_name: name,
            joined_at: m.joined_at,
          };
        }
      }
      continue;
    }

    if (did) {
      const prev = byDevice.get(did);

      if (!prev) {
        byDevice.set(did, m);
      } else {
        const prevName = prev.display_name;

        if ((prevName === "You" || !prevName) && name && name !== "You") {
          byDevice.set(did, m);
        }
      }
      continue;
    }

    const key = `fallback:${name}:${m.joined_at}`;
    if (!byDevice.has(key)) {
      byDevice.set(key, m);
    }
  }

  if (bestMe) result.push(bestMe);
  result.push(...Array.from(byDevice.values()));

  return result;
}

export default function RoomClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const classId = (searchParams.get("classId") ?? "").trim();
  const sessionId = (searchParams.get("sessionId") ?? "").trim();

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [msgs, setMsgs] = useState<RoomMessage[]>([]);
  const [draft, setDraft] = useState("");

  const deviceIdRef = useRef("");
  const displayNameRef = useRef("");

  useEffect(() => {
    deviceIdRef.current = getOrCreateDeviceId();
    displayNameRef.current =
      localStorage.getItem("classmate_display_name") ||
      localStorage.getItem("display_name") ||
      "You";
  }, []);

  const visibleMembers = useMemo(() => {
    return dedupeMembers(
      members,
      deviceIdRef.current,
      displayNameRef.current
    );
  }, [members]);

  useEffect(() => {
    if (!sessionId) return;

    const deviceId = deviceIdRef.current;
    const name = displayNameRef.current;

    fetch("/api/session/join", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sessionId,
        deviceId,
        name,
        capacity: 5,
      }),
    });
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    const interval = setInterval(async () => {
      const res = await fetch(`/api/session/status?sessionId=${sessionId}`);
      const json = await res.json();

      if (json?.members) {
        setMembers(
          dedupeMembers(
            json.members,
            deviceIdRef.current,
            displayNameRef.current
          )
        );
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [sessionId]);

  async function sendMessage() {
    if (!draft.trim()) return;

    const deviceId = deviceIdRef.current;
    const name = displayNameRef.current;

    await supabase.from("room_messages").insert({
      session_id: sessionId,
      device_id: deviceId,
      display_name: name,
      message: draft,
    });

    setDraft("");
  }

  return (
    <ChalkboardRoomShell
      title="ルーム"
      subtitle={`${visibleMembers.length}人`}
      onBack={() => router.push("/class/select")}
      onStartCall={() => router.push(`/call?sessionId=${sessionId}`)}
      startDisabled={!sessionId}
      startLabel="通話開始"
    >
      <div style={{ display: "grid", gap: 12 }}>
        <div>
          {visibleMembers.map((m, i) => (
            <div key={i}>
              {m.display_name || "You"}
            </div>
          ))}
        </div>

        <div>
          {msgs.map((m) => (
            <div key={m.id}>
              {m.display_name}: {m.message}
            </div>
          ))}
        </div>

        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />

        <button onClick={sendMessage}>送信</button>
      </div>
    </ChalkboardRoomShell>
  );
}