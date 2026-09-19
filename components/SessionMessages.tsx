"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import { renderMessageTextWithLinks } from "@/lib/messageLinkify";
import { isJumboEmojiMessage, countEmojiTokens } from "@/lib/messageEmoji";
import {
  MESSAGE_HISTORY_LIMIT,
  MESSAGE_MAX_LENGTH,
  validateMessageText,
} from "@/lib/messageLimits";

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

/** Flat stroke icons — avoid colorful system emoji glyphs in the composer chrome. */
function GlyphSmile({ active = false }: { active?: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M9 10h.01" />
      <path d="M15 10h.01" />
      <path
        d={active ? "M8.5 14.5c1.2 1.4 2.7 2 3.5 2s2.3-.6 3.5-2" : "M8.5 15c1.2 1.2 2.7 1.8 3.5 1.8s2.3-.6 3.5-1.8"}
      />
    </svg>
  );
}

function GlyphCamera() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h2l1.2-1.6A1.5 1.5 0 0 1 10.9 4h2.2a1.5 1.5 0 0 1 1.2.4L15.5 6H17.5A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z" />
      <circle cx="12" cy="12.5" r="3.25" />
    </svg>
  );
}

const composerIconBtnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 40,
  height: 40,
  padding: 0,
  border: "1px solid #d1d5db",
  borderRadius: 999,
  background: "#fff",
  color: "#475569",
  cursor: "pointer",
  flexShrink: 0,
  lineHeight: 0,
};

function GlyphChevronUp() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 15l6-6 6 6" />
    </svg>
  );
}

function GlyphChevronDown() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

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
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [menuMessageId, setMenuMessageId] = useState<string | null>(null);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const deletedMessageIdsRef = useRef<Set<string>>(new Set());
  const longPressRef = useRef<{
    id: string;
    timer: number;
    x: number;
    y: number;
  } | null>(null);

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
    setInitialLoadDone(false);

    async function loadMessages() {
      if (!deviceId) {
        setErr("メッセージを表示できません");
        setInitialLoadDone(true);
        return;
      }

      try {
        const res = await fetch(
          `/api/session/messages?sessionId=${encodeURIComponent(sessionId)}&deviceId=${encodeURIComponent(deviceId)}&limit=${MESSAGE_HISTORY_LIMIT}`,
          { cache: "no-store" }
        );
        const json = await res.json().catch(() => null);

        if (cancelled) return;

        if (!res.ok || !json?.ok) {
          console.warn("[messages] load failed", json);
          setErr(
            json?.error === "forbidden"
              ? "このルームのメッセージを閲覧する権限がありません"
              : "メッセージの取得に失敗しました"
          );
          return;
        }

        const data = (json.messages ?? []) as RoomMessage[];

        for (const m of data) {
          if (m?.id && m.deleted_at) {
            deletedMessageIdsRef.current.add(m.id);
          }
        }

        setMessages(dedupeMessages(data));
        setErr("");
        scrollToBottomNextFrame("auto");
      } finally {
        if (!cancelled) setInitialLoadDone(true);
      }
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

            return Array.from(map.values())
              .sort((a, b) => {
                const at = new Date(a.created_at ?? 0).getTime();
                const bt = new Date(b.created_at ?? 0).getTime();
                return at - bt;
              })
              .slice(-MESSAGE_HISTORY_LIMIT);
          });

          scrollToBottomNextFrame("smooth");
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [sessionId, deviceId]);

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
    const validation = validateMessageText(draft);
    if (!validation.ok) {
      setErr(validation.message);
      return;
    }
    if (!sessionId || !deviceId || sending) return;

    const text = validation.text;
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
    setErr("");
    setSending(true);
    setMessages((prev) => dedupeMessages([...prev, temp]));
    scrollToBottomNextFrame("smooth");

    try {
      const res = await fetch("/api/session/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          deviceId,
          displayName: name,
          message: text,
        }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        console.warn("[messages] send text failed", json);
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setDraft(text);
        setErr(
          String(json?.message ?? "").trim() || "送信に失敗しました"
        );
        return;
      }

      if (json.message?.id) {
        setMessages((prev) =>
          dedupeMessages([
            ...prev.filter((m) => m.id !== tempId),
            json.message as RoomMessage,
          ])
        );
      }

      scrollToBottomNextFrame("smooth");
    } finally {
      setSending(false);
    }
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

  function clearLongPressTimer() {
    const lp = longPressRef.current;
    if (lp?.timer) window.clearTimeout(lp.timer);
    longPressRef.current = null;
  }

  function openMessageMenu(id: string) {
    clearLongPressTimer();
    setMenuMessageId(id);
    window.getSelection()?.removeAllRanges();
  }

  function closeMessageMenu() {
    setMenuMessageId(null);
  }

  useEffect(() => {
    if (!menuMessageId) return;

    const onPointerDown = (ev: PointerEvent) => {
      const target = ev.target as HTMLElement | null;
      if (target?.closest?.("[data-cm-msg-menu]")) return;
      if (target?.closest?.(`[data-cm-msg-id="${menuMessageId}"]`)) return;
      closeMessageMenu();
    };

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") closeMessageMenu();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuMessageId]);

  function bindOwnMessagePress(m: RoomMessage) {
    const isMe =
      String(m.device_id ?? "").trim() === String(deviceId ?? "").trim();
    if (!isMe || m.deleted_at) return {};

    return {
      "data-cm-msg-id": m.id,
      onPointerDown: (ev: ReactPointerEvent) => {
        if (ev.pointerType === "mouse" && ev.button !== 0) return;
        clearLongPressTimer();
        const timer = window.setTimeout(() => {
          openMessageMenu(m.id);
          try {
            navigator.vibrate?.(12);
          } catch {
            // ignore
          }
        }, 450);
        longPressRef.current = {
          id: m.id,
          timer,
          x: ev.clientX,
          y: ev.clientY,
        };
      },
      onPointerMove: (ev: ReactPointerEvent) => {
        const lp = longPressRef.current;
        if (!lp || lp.id !== m.id) return;
        const dx = ev.clientX - lp.x;
        const dy = ev.clientY - lp.y;
        if (dx * dx + dy * dy > 100) clearLongPressTimer();
      },
      onPointerUp: () => clearLongPressTimer(),
      onPointerCancel: () => clearLongPressTimer(),
      onPointerLeave: () => clearLongPressTimer(),
      onContextMenu: (ev: ReactMouseEvent) => {
        ev.preventDefault();
        openMessageMenu(m.id);
      },
    } as const;
  }

  const body = (
    <>
      {err ? (
        <div
          className="cm-home-error cm-room-msg-error"
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
          className="classmate-session-messages-list cm-room-msg-list"
          style={{
            display: "grid",
            gap: 10,
            maxHeight,
            overflowY: "auto",
            paddingRight: 4,
            marginBottom: 12,
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        >
          {!initialLoadDone ? (
            <div className="cm-room-loading-line" style={{ color: "#666", fontSize: 13 }}>
              メッセージを確認しています…
            </div>
          ) : err && messages.length === 0 ? (
            <div style={{ color: "#b91c1c", fontSize: 13 }}>{err}</div>
          ) : messages.length === 0 ? (
            <div className="cm-room-msg-empty">ここにメッセージが表示されます</div>
          ) : (
            messages.map((m) => {
              const isMe =
                String(m.device_id ?? "").trim() === String(deviceId ?? "").trim();
              const jumboEmoji =
                !m.deleted_at &&
                m.message_type !== "image" &&
                isJumboEmojiMessage(m.message);
              const jumboCount = jumboEmoji
                ? countEmojiTokens(m.message.trim())
                : 0;
              const pressBind = bindOwnMessagePress(m);
              const menuOpen = menuMessageId === m.id;

              return (
                <div
                  key={m.id}
                  className={isMe ? "cm-room-msg-row is-me" : "cm-room-msg-row"}
                  style={{
                    display: "grid",
                    gap: 4,
                    justifyItems: isMe ? "end" : "start",
                    position: "relative",
                  }}
                >
                  <div
                    className="cm-room-msg-meta"
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

                  {jumboEmoji ? (
                    <div
                      className={
                        isMe
                          ? "cm-room-msg-emoji is-me"
                          : "cm-room-msg-emoji"
                      }
                      data-count={jumboCount}
                      aria-label={m.message.trim()}
                      style={{ touchAction: "manipulation", cursor: isMe ? "pointer" : undefined }}
                      {...pressBind}
                    >
                      {m.message.trim()}
                    </div>
                  ) : (
                    <div
                      className={
                        isMe ? "cm-room-msg-bubble is-me" : "cm-room-msg-bubble"
                      }
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
                        touchAction: "manipulation",
                        cursor: isMe && !m.deleted_at ? "pointer" : undefined,
                      }}
                      {...pressBind}
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
                          draggable={false}
                          style={{
                            maxWidth: "100%",
                            maxHeight: 240,
                            borderRadius: 10,
                            display: "block",
                            objectFit: "contain",
                            pointerEvents: "none",
                          }}
                        />
                      ) : (
                        renderMessageTextWithLinks(m.message)
                      )}
                    </div>
                  )}

                  {menuOpen && isMe && !m.deleted_at ? (
                    <div
                      data-cm-msg-menu
                      className="cm-room-msg-menu"
                      role="menu"
                      style={{
                        position: "absolute",
                        top: "100%",
                        right: isMe ? 0 : "auto",
                        left: isMe ? "auto" : 0,
                        zIndex: 5,
                        marginTop: 4,
                        minWidth: 132,
                        padding: 6,
                        borderRadius: 12,
                        border: "1px solid #e5e7eb",
                        background: "#fff",
                        boxShadow: "0 10px 28px rgba(15, 23, 42, 0.14)",
                        display: "grid",
                        gap: 4,
                      }}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        disabled={deletingId === m.id}
                        onClick={() => {
                          closeMessageMenu();
                          void deleteMessage(m);
                        }}
                        style={{
                          border: "none",
                          borderRadius: 8,
                          padding: "10px 12px",
                          background: "#fff1f2",
                          color: "#be123c",
                          fontWeight: 800,
                          fontSize: 13,
                          textAlign: "left",
                          cursor:
                            deletingId === m.id ? "not-allowed" : "pointer",
                        }}
                      >
                        {deletingId === m.id ? "取り消し中…" : "取り消し"}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={closeMessageMenu}
                        style={{
                          border: "none",
                          borderRadius: 8,
                          padding: "8px 12px",
                          background: "transparent",
                          color: "#64748b",
                          fontWeight: 700,
                          fontSize: 12,
                          textAlign: "left",
                          cursor: "pointer",
                        }}
                      >
                        閉じる
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        {messages.length > 0 ? (
          <div className="cm-room-msg-scroll-controls">
            <button
              type="button"
              className="cm-room-msg-scroll-btn"
              title="先頭へ"
              aria-label="先頭へ"
              onClick={() => scrollToTopNextFrame("smooth")}
            >
              <GlyphChevronUp />
            </button>
            <button
              type="button"
              className="cm-room-msg-scroll-btn"
              title="最新へ"
              aria-label="最新へ"
              onClick={() => scrollToBottomNextFrame("smooth")}
            >
              <GlyphChevronDown />
            </button>
          </div>
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
            aria-label="絵文字を選ぶ"
            aria-pressed={showEmojiPicker}
            onClick={() => {
              setShowEmojiPicker((prev) => !prev);
              inputRef.current?.focus();
            }}
            style={{
              ...composerIconBtnStyle,
              color: showEmojiPicker ? "#0f766e" : "#475569",
              borderColor: showEmojiPicker ? "#99f6e4" : "#d1d5db",
              background: showEmojiPicker ? "#f0fdfa" : "#fff",
            }}
          >
            <GlyphSmile active={showEmojiPicker} />
          </button>

          <label
            aria-label="画像を添付"
            style={{
              ...composerIconBtnStyle,
              cursor: sending ? "not-allowed" : "pointer",
              opacity: sending ? 0.6 : 1,
            }}
          >
            <GlyphCamera />
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
            onChange={(e) => setDraft(e.target.value.slice(0, MESSAGE_MAX_LENGTH))}
            maxLength={MESSAGE_MAX_LENGTH}
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
            className="cm-room-send-btn"
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
      className="cm-paper-card cm-room-messages"
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
            <span className="cm-section-title">{title}</span>
            <span style={{ color: "#6b7280", fontSize: 12 }}>
              {messages.length}件 {show ? "▲" : "▼"}
            </span>
          </button>

          {show ? <div style={{ marginTop: 12 }}>{body}</div> : null}
        </>
      ) : (
        <>
          <div
            className="cm-section-title"
            style={{ fontWeight: 900, marginBottom: 8, width: "fit-content" }}
          >
            {title}
          </div>
          {body}
        </>
      )}
    </section>
  );
}