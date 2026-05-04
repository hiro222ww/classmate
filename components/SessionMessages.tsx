"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type RoomMessage = {
  id: string;
  session_id: string;
  device_id: string;
  display_name: string;
  message: string;
  image_path?: string | null;
  message_type?: "text" | "image";
  deleted_at?: string | null;
  created_at: string;
};

type Props = {
  sessionId: string;
  deviceId: string;
  displayName: string;
  title?: string;
  maxHeight?: number;
  collapsible?: boolean;
};

const EMOJIS = [
  "😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😚",
  "😋","😛","😝","😜","🤪","🤨","🧐","🤓","😎","🥸","🤩","🥳","😏","😒","😞","😔","😟","😕","🙁","☹️",
  "😣","😖","😫","😩","🥺","😢","😭","😤","😠","😡","🤬","🤯","😳","🥵","🥶","😱","😨","😰","😥","😓",
  "🫣","🤗","🫡","🤔","🫢","🤭","🤫","🤥","😶","😐","😑","😬","🫨","🙄","😯","😦","😧","😮","😲","🥱",
  "😴","🤤","😪","😮‍💨","😵","😵‍💫","🤐","🥴","🤢","🤮","🤧","😷","🤒","🤕",
  "👍","👎","👌","🤌","🤏","✌️","🤞","🫰","🤟","🤘","🤙","👈","👉","👆","👇","☝️","✋","🤚","🖐️","🖖",
  "👋","🤝","👏","🙌","🫶","🙏","✍️","💪","🦾","🖕","🙇","🤷","🤦",
  "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❤️‍🔥","❤️‍🩹","💕","💞","💓","💗","💖","💘","💝","💟",
  "🔥","✨","💯","💢","💥","💫","💦","💨","🕳️","💬","👀","🧠","🫀","🫁","👑","🎉","🎊","🎁","🏆","🥇",
  "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🐤","🦆",
  "🍎","🍊","🍋","🍌","🍉","🍇","🍓","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🥑","🍆","🥔","🥕","🌽","🍞",
  "🍙","🍚","🍜","🍣","🍤","🍱","🍛","🍔","🍟","🍕","🌭","🥪","🌮","🌯","🥗","🍰","🎂","🍮","🍩","🍪",
  "☀️","🌤️","⛅","🌥️","☁️","🌧️","⛈️","🌩️","🌨️","❄️","🌈","🌙","⭐","🌟","⚡","☔","🌊","🌸","🌻","🍀",
];

function formatTime(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dedupeMessages(list: RoomMessage[]) {
  const map = new Map<string, RoomMessage>();

  for (const m of list) {
    if (!m?.id) continue;

    const existing = map.get(m.id);
    const deleted_at = existing?.deleted_at || m.deleted_at || null;

    map.set(m.id, {
      ...existing,
      ...m,
      deleted_at,
      message: deleted_at ? "" : m.message,
      image_path: deleted_at ? null : m.image_path,
      message_type: deleted_at ? "text" : m.message_type,
    });
  }

  return Array.from(map.values()).sort((a, b) => {
    const at = new Date(a.created_at ?? 0).getTime();
    const bt = new Date(b.created_at ?? 0).getTime();
    return at - bt;
  });
}

async function compressImage(file: File): Promise<File> {
  const allowed = ["image/jpeg", "image/png", "image/webp"];

  if (!allowed.includes(file.type)) {
    throw new Error("送信できる画像は JPG / PNG / WebP のみです");
  }

  if (file.size > 8 * 1024 * 1024) {
    throw new Error("画像は8MB以下にしてください");
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = objectUrl;
    });

    const maxSize = 1280;
    const scale = Math.min(1, maxSize / Math.max(image.width, image.height));

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("画像の圧縮に失敗しました");

    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (!b) reject(new Error("画像の圧縮に失敗しました"));
          else resolve(b);
        },
        "image/jpeg",
        0.72
      );
    });

    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function SessionMessages({
  sessionId,
  deviceId,
  displayName,
  title = "メッセージ",
  maxHeight = 320,
  collapsible = false,
}: Props) {
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [show, setShow] = useState(!collapsible);
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const deletedMessageIdsRef = useRef<Set<string>>(new Set());

  const pendingImageUrl = useMemo(() => {
    if (!pendingImage) return "";
    return URL.createObjectURL(pendingImage);
  }, [pendingImage]);

  useEffect(() => {
    return () => {
      if (pendingImageUrl) URL.revokeObjectURL(pendingImageUrl);
    };
  }, [pendingImageUrl]);

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    const box = boxRef.current;
    if (!box) return;
    box.scrollTo({ top: box.scrollHeight, behavior });
  }

  function scrollToTop(behavior: ScrollBehavior = "smooth") {
    const box = boxRef.current;
    if (!box) return;
    box.scrollTo({ top: 0, behavior });
  }

  function scrollToBottomNextFrame(behavior: ScrollBehavior = "smooth") {
    requestAnimationFrame(() => scrollToBottom(behavior));
  }

  function scrollToTopNextFrame(behavior: ScrollBehavior = "smooth") {
    requestAnimationFrame(() => scrollToTop(behavior));
  }

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;
    deletedMessageIdsRef.current.clear();

    async function loadMessages() {
      const { data, error } = await supabase
        .from("room_messages")
        .select(
          "id, session_id, device_id, display_name, message, image_path, message_type, deleted_at, created_at"
        )
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true })
        .limit(200);

      if (cancelled) return;

      if (error) {
        console.warn("[messages] load failed", error);
        setErr("メッセージの取得に失敗しました");
        return;
      }

      for (const m of data ?? []) {
        if ((m as RoomMessage).id && (m as RoomMessage).deleted_at) {
          deletedMessageIdsRef.current.add((m as RoomMessage).id);
        }
      }

      setMessages(dedupeMessages((data ?? []) as RoomMessage[]));
      setErr("");
      scrollToBottomNextFrame("auto");
    }

    void loadMessages();

    const channel = supabase
      .channel(`session-messages-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_messages",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload: any) => {
          const row =
            payload.eventType === "DELETE" ? payload.old : payload.new;

          if (!row?.id) return;

          setMessages((prev) => {
            const map = new Map(prev.map((m) => [m.id, m]));
            const existing = map.get(row.id);

            if (row.deleted_at) {
              deletedMessageIdsRef.current.add(row.id);
            }

            const wasDeleted =
              deletedMessageIdsRef.current.has(row.id) ||
              !!existing?.deleted_at ||
              !!row.deleted_at;

            map.set(row.id, {
              ...existing,
              ...row,
              deleted_at: wasDeleted
                ? existing?.deleted_at || row.deleted_at || new Date().toISOString()
                : null,
              message: wasDeleted ? "" : row.message,
              image_path: wasDeleted ? null : row.image_path,
              message_type: wasDeleted ? "text" : row.message_type,
            });

            return Array.from(map.values()).sort((a, b) => {
              const at = new Date(a.created_at ?? 0).getTime();
              const bt = new Date(b.created_at ?? 0).getTime();
              return at - bt;
            });
          });

          scrollToBottomNextFrame("smooth");
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [sessionId]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;

    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    if (nearBottom) scrollToBottomNextFrame("smooth");
  }, [messages, show]);

  useEffect(() => {
    if (!show) return;
    scrollToBottomNextFrame("auto");
  }, [show]);

  async function sendText() {
    const text = draft.trim();
    if (!text || !sessionId || !deviceId || sending) return;

    const name = displayName && displayName !== "You" ? displayName : "参加者";

    const tempId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const temp: RoomMessage = {
      id: tempId,
      session_id: sessionId,
      device_id: deviceId,
      display_name: name,
      message: text,
      message_type: "text",
      deleted_at: null,
      created_at: new Date().toISOString(),
    };

    setDraft("");
    setShowEmojiPicker(false);
    setMessages((prev) => dedupeMessages([...prev, temp]));
    scrollToBottomNextFrame("smooth");

    const { data, error } = await supabase
      .from("room_messages")
      .insert({
        session_id: sessionId,
        device_id: deviceId,
        display_name: name,
        message: text,
        message_type: "text",
      })
      .select(
        "id, session_id, device_id, display_name, message, image_path, message_type, deleted_at, created_at"
      )
      .single();

    if (error) {
      console.warn("[messages] send text failed", error);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(text);
      setErr("送信に失敗しました");
      return;
    }

    if (data?.id) {
      setMessages((prev) =>
        dedupeMessages([
          ...prev.filter((m) => m.id !== tempId),
          data as RoomMessage,
        ])
      );
    }

    scrollToBottomNextFrame("smooth");
  }

  async function sendImage(file: File) {
    if (!sessionId || !deviceId || sending) return;

    try {
      setSending(true);
      setErr("");
      setShowEmojiPicker(false);

      const name = displayName && displayName !== "You" ? displayName : "参加者";
      const compressed = await compressImage(file);

      const safeFileName = compressed.name
        .replace(/[^\w.\-]/g, "_")
        .slice(0, 80);

      const path = `${sessionId}/${deviceId}/${Date.now()}-${safeFileName}`;

      const { error: uploadError } = await supabase.storage
        .from("room-message-images")
        .upload(path, compressed, {
          contentType: compressed.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from("room_messages")
        .insert({
          session_id: sessionId,
          device_id: deviceId,
          display_name: name,
          message: "",
          image_path: path,
          message_type: "image",
        })
        .select(
          "id, session_id, device_id, display_name, message, image_path, message_type, deleted_at, created_at"
        )
        .single();

      if (error) throw error;

      if (data?.id) {
        const inserted = data as RoomMessage;
        setMessages((prev) =>
          dedupeMessages([
            ...prev.filter((m) => m.id !== inserted.id),
            inserted,
          ])
        );
      }

      setPendingImage(null);
      scrollToBottomNextFrame("smooth");
    } catch (e: any) {
      console.warn("[messages] send image failed", e);
      setErr(e?.message ?? "画像の送信に失敗しました");
    } finally {
      setSending(false);
    }
  }

  async function deleteMessage(m: RoomMessage) {
    if (!m?.id || !deviceId || deletingId) return;

    setDeletingId(m.id);

    const deletedAt = new Date().toISOString();

    deletedMessageIdsRef.current.add(m.id);

    setMessages((prev) =>
      dedupeMessages(
        prev.map((x) =>
          x.id === m.id
            ? {
                ...x,
                deleted_at: deletedAt,
                message: "",
                image_path: null,
                message_type: "text",
              }
            : x
        )
      )
    );

    try {
      const res = await fetch("/api/messages/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messageId: m.id,
          deviceId,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        console.warn("[messages] delete api failed", json);
        setErr("取り消しに失敗しました");
        return;
      }

      if (json.message?.id) {
        setMessages((prev) =>
          dedupeMessages([
            ...prev.filter((x) => x.id !== json.message.id),
            json.message as RoomMessage,
          ])
        );
      }
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSendTextOnly() {
    await sendText();
  }

  async function handleSendButton() {
    if (pendingImage) {
      await sendImage(pendingImage);
      return;
    }

    await sendText();
  }

  const body = (
    <>
      {err ? (
        <div
          style={{
            marginBottom: 8,
            color: "#b91c1c",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 10,
            padding: "8px 10px",
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          {err}
        </div>
      ) : null}

      <div style={{ position: "relative" }}>
        <div
          ref={boxRef}
          style={{
            display: "grid",
            gap: 10,
            maxHeight,
            overflowY: "auto",
            paddingRight: 4,
            marginBottom: 12,
          }}
        >
          {messages.length === 0 ? (
            <div style={{ color: "#666", fontSize: 13 }}>
              まだメッセージはありません
            </div>
          ) : (
            messages.map((m) => {
              const isMe =
                String(m.device_id ?? "").trim() === String(deviceId ?? "").trim();

              return (
                <div
                  key={m.id}
                  style={{
                    display: "grid",
                    gap: 4,
                    justifyItems: isMe ? "end" : "start",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: "#6b7280",
                      fontWeight: 800,
                      padding: isMe ? "0 4px 0 0" : "0 0 0 4px",
                    }}
                  >
                    {isMe ? "自分" : m.display_name || "参加者"}・
                    {formatTime(m.created_at)}
                  </div>

                  <div
                    style={{
                      maxWidth: "78%",
                      padding: "9px 11px",
                      borderRadius: 14,
                      background: isMe ? "#dcfce7" : "#f9fafb",
                      border: "1px solid #e5e7eb",
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}
                  >
                    {m.deleted_at ? (
                      <span style={{ color: "#9ca3af", fontStyle: "italic" }}>
                        メッセージを取り消しました
                      </span>
                    ) : m.message_type === "image" && m.image_path ? (
                      <img
                        src={
                          supabase.storage
                            .from("room-message-images")
                            .getPublicUrl(m.image_path).data.publicUrl
                        }
                        alt="送信画像"
                        loading="lazy"
                        style={{
                          maxWidth: "100%",
                          maxHeight: 240,
                          borderRadius: 10,
                          display: "block",
                          objectFit: "contain",
                        }}
                      />
                    ) : (
                      m.message
                    )}
                  </div>

                  {isMe && !m.deleted_at ? (
                    <button
                      type="button"
                      disabled={deletingId === m.id}
                      onClick={() => void deleteMessage(m)}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: deletingId === m.id ? "#d1d5db" : "#9ca3af",
                        fontSize: 11,
                        cursor: deletingId === m.id ? "not-allowed" : "pointer",
                        padding: "0 4px",
                      }}
                    >
                      {deletingId === m.id ? "取り消し中" : "取り消し"}
                    </button>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        {messages.length > 0 ? (
          <>
            <button
              type="button"
              title="先頭へ"
              onClick={() => scrollToTopNextFrame("smooth")}
              style={{
                position: "absolute",
                left: "50%",
                bottom: 80,
                transform: "translateX(-50%)",
                borderRadius: 999,
                width: 40,
                height: 40,
                background: "#6b7280",
                color: "#fff",
                border: "none",
                fontSize: 18,
                fontWeight: 900,
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                zIndex: 2,
              }}
            >
              ↑
            </button>

            <button
              type="button"
              title="最新へ"
              onClick={() => scrollToBottomNextFrame("smooth")}
              style={{
                position: "absolute",
                left: "50%",
                bottom: 20,
                transform: "translateX(-50%)",
                borderRadius: 999,
                width: 40,
                height: 40,
                background: "#22c55e",
                color: "#fff",
                border: "none",
                fontSize: 18,
                fontWeight: 900,
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                zIndex: 2,
              }}
            >
              ↓
            </button>
          </>
        ) : null}
      </div>

      {pendingImage ? (
        <div
          style={{
            marginBottom: 10,
            padding: 8,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            background: "#f9fafb",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <img
            src={pendingImageUrl}
            alt="送信予定画像"
            style={{
              width: 76,
              height: 76,
              objectFit: "cover",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
            }}
          />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>
              画像を送信しますか？
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>
              {pendingImage.name}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setPendingImage(null)}
            style={{
              border: "none",
              borderRadius: 999,
              padding: "8px 10px",
              background: "#ef4444",
              color: "#fff",
              fontWeight: 900,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            やめる
          </button>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 8 }}>
        {showEmojiPicker ? (
          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              maxHeight: 160,
              overflowY: "auto",
              padding: 8,
              border: "1px solid #e5e7eb",
              borderRadius: 14,
              background: "#fff",
            }}
          >
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setDraft((prev) => prev + emoji);
                  inputRef.current?.focus();
                }}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 22,
                  padding: 4,
                  lineHeight: 1.1,
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <button
            type="button"
            onClick={() => {
              setShowEmojiPicker((prev) => !prev);
              inputRef.current?.focus();
            }}
            style={{
              border: "1px solid #d1d5db",
              borderRadius: 999,
              padding: "10px 12px",
              background: "#fff",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          >
            😊
          </button>

          <label
            style={{
              border: "1px solid #d1d5db",
              borderRadius: 999,
              padding: "10px 12px",
              cursor: sending ? "not-allowed" : "pointer",
              background: "#fff",
              opacity: sending ? 0.6 : 1,
              whiteSpace: "nowrap",
              lineHeight: 1,
            }}
          >
            📷
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={sending}
              style={{ display: "none" }}
              onClick={(e) => {
                e.currentTarget.value = "";
              }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setPendingImage(file);
              }}
            />
          </label>

          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => {
              window.setTimeout(() => setIsComposing(false), 0);
            }}
            onKeyDown={(e) => {
              const native = e.nativeEvent as KeyboardEvent & {
                isComposing?: boolean;
                keyCode?: number;
              };

              if (isComposing) return;
              if (native?.isComposing) return;
              if (e.key === "Process") return;
              if (native?.keyCode === 229) return;

              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();

                if (!pendingImage) {
                  void handleSendTextOnly();
                }
              }
            }}
            placeholder={pendingImage ? "送信ボタンで画像を送信" : "メッセージを入力"}
            disabled={sending}
            style={{
              flex: 1,
              border: "1px solid #d1d5db",
              borderRadius: 999,
              padding: "10px 12px",
              background: "#fff",
              minWidth: 0,
            }}
          />

          <button
            type="button"
            onClick={() => void handleSendButton()}
            disabled={sending || (!draft.trim() && !pendingImage)}
            style={{
              border: "none",
              borderRadius: 999,
              padding: "10px 14px",
              background:
                sending || (!draft.trim() && !pendingImage)
                  ? "#9ca3af"
                  : "#22c55e",
              color: "#fff",
              fontWeight: 900,
              cursor:
                sending || (!draft.trim() && !pendingImage)
                  ? "not-allowed"
                  : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {sending ? "送信中" : "送信"}
          </button>
        </div>
      </div>
    </>
  );

  return (
    <section
      style={{
        padding: 14,
        border: "1px solid #e5e7eb",
        borderRadius: 18,
        background: "#fff",
      }}
    >
      {collapsible ? (
        <>
          <button
            type="button"
            onClick={() => setShow((prev) => !prev)}
            style={{
              width: "100%",
              border: "none",
              background: "transparent",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontWeight: 900,
              fontSize: 15,
              cursor: "pointer",
              padding: 0,
            }}
          >
            <span>{title}</span>
            <span style={{ color: "#6b7280", fontSize: 12 }}>
              {messages.length}件 {show ? "▲" : "▼"}
            </span>
          </button>

          {show ? <div style={{ marginTop: 12 }}>{body}</div> : null}
        </>
      ) : (
        <>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>{title}</div>
          {body}
        </>
      )}
    </section>
  );
}