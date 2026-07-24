"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { renderMessageTextWithLinks } from "@/lib/messageLinkify";
import {
  MESSAGE_HISTORY_LIMIT,
  MESSAGE_MAX_LENGTH,
  validateMessageText,
} from "@/lib/messageLimits";

type ClassMessage = {
  id: string;
  class_id: string;
  device_id: string;
  message: string;
  msg_type?: string;
  created_at: string;
  display_name?: string;
};

type Props = {
  classId: string;
  deviceId: string;
  maxHeight?: number;
};

function formatTime(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dedupe(list: ClassMessage[]) {
  const map = new Map<string, ClassMessage>();
  for (const m of list) {
    if (!m?.id) continue;
    map.set(String(m.id), m);
  }
  return Array.from(map.values())
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    .slice(-MESSAGE_HISTORY_LIMIT);
}

export default function ClassMessages({
  classId,
  deviceId,
  maxHeight = 240,
}: Props) {
  const [messages, setMessages] = useState<ClassMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !classId || !deviceId) return;
    let cancelled = false;
    setInitialLoadDone(false);

    async function load() {
      try {
        const res = await fetch("/api/class/messages", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            classId,
            deviceId,
            limit: MESSAGE_HISTORY_LIMIT,
          }),
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setErr(
            json?.error === "forbidden" || json?.error === "not_a_member"
              ? "このクラスのメッセージを閲覧する権限がありません"
              : "メッセージの取得に失敗しました"
          );
          return;
        }
        setMessages(dedupe((json?.messages ?? []) as ClassMessage[]));
        setErr("");
        requestAnimationFrame(() => {
          const box = boxRef.current;
          if (box) box.scrollTop = box.scrollHeight;
        });
      } finally {
        if (!cancelled) setInitialLoadDone(true);
      }
    }

    void load();

    const channel = supabase
      .channel(`class-messages-${classId}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "class_messages",
          filter: `class_id=eq.${classId}`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const row = payload?.new as ClassMessage | undefined;
          if (!row?.id) return;
          setMessages((prev) =>
            dedupe([
              ...prev,
              {
                ...row,
                display_name: row.display_name || "参加者",
              },
            ])
          );
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [open, classId, deviceId]);

  async function send() {
    const validation = validateMessageText(draft);
    if (!validation.ok) {
      setErr(validation.message);
      return;
    }
    if (sending) return;

    setSending(true);
    setErr("");
    const text = validation.text;
    setDraft("");

    try {
      const res = await fetch("/api/class/post", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classId,
          deviceId,
          message: text,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.ok === false) {
        setDraft(text);
        setErr(String(json?.message ?? json?.error ?? "送信に失敗しました"));
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          border: "1px solid #d1d5db",
          background: "#fff",
          borderRadius: 10,
          padding: "8px 12px",
          fontWeight: 800,
          fontSize: 13,
          cursor: "pointer",
          color: "#374151",
        }}
      >
        {open ? "クラスメッセージを閉じる" : "クラスメッセージ"}
      </button>

      {open ? (
        <div
          style={{
            marginTop: 10,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 12,
            background: "#fff",
          }}
        >
          {err ? (
            <div
              style={{
                marginBottom: 8,
                color: "#b91c1c",
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              {err}
            </div>
          ) : null}

          <div
            ref={boxRef}
            style={{
              maxHeight,
              overflowY: "auto",
              display: "grid",
              gap: 8,
              marginBottom: 10,
            }}
          >
            {!initialLoadDone ? (
              <div style={{ color: "#6b7280", fontSize: 12 }}>
                メッセージを確認しています…
              </div>
            ) : err && messages.length === 0 ? (
              <div style={{ color: "#b91c1c", fontSize: 12 }}>{err}</div>
            ) : messages.length === 0 ? (
              <div style={{ color: "#6b7280", fontSize: 12 }}>
                まだメッセージはありません
              </div>
            ) : (
              messages.map((m) => {
                const isMe =
                  String(m.device_id ?? "").trim() ===
                  String(deviceId ?? "").trim();
                return (
                  <div
                    key={m.id}
                    style={{
                      display: "grid",
                      gap: 2,
                      justifyItems: isMe ? "end" : "start",
                    }}
                  >
                    <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 800 }}>
                      {isMe ? "自分" : m.display_name || "参加者"}・
                      {formatTime(m.created_at)}
                    </div>
                    <div
                      style={{
                        maxWidth: "85%",
                        padding: "8px 10px",
                        borderRadius: 12,
                        background: isMe ? "#dcfce7" : "#f3f4f6",
                        border: "1px solid #e5e7eb",
                        fontSize: 13,
                        lineHeight: 1.5,
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {renderMessageTextWithLinks(m.message)}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={draft}
              maxLength={MESSAGE_MAX_LENGTH}
              onChange={(e) =>
                setDraft(e.target.value.slice(0, MESSAGE_MAX_LENGTH))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="メッセージを入力"
              style={{
                flex: 1,
                border: "1px solid #d1d5db",
                borderRadius: 10,
                padding: "10px 12px",
                fontSize: 13,
              }}
            />
            <button
              type="button"
              disabled={sending || !draft.trim()}
              onClick={() => void send()}
              style={{
                border: "none",
                borderRadius: 10,
                padding: "10px 14px",
                background: sending || !draft.trim() ? "#d1d5db" : "#22c55e",
                color: "#fff",
                fontWeight: 900,
                cursor: sending || !draft.trim() ? "not-allowed" : "pointer",
              }}
            >
              送信
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
