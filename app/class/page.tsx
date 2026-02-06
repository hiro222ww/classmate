"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getOrCreateDeviceId } from "@/lib/device";

type ActiveClass = {
  class_id: string;
  class_name: string;
  world_key: string | null;
  topic_key: string | null;
  min_age: number;
  is_sensitive: boolean;
  is_premium: boolean;
};

type Msg = {
  id: string;
  class_id: string;
  device_id: string;
  message: string;
  msg_type: "user" | "system";
  created_at: string;
};

function mergeMessages(prev: Msg[], incoming: Msg[]) {
  const map = new Map<string, Msg>();
  for (const m of prev) map.set(m.id, m);
  for (const m of incoming) map.set(m.id, m);
  const arr = Array.from(map.values());
  arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return arr;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ClassHomePage() {
  const [deviceId, setDeviceId] = useState("");
  const [activeClass, setActiveClass] = useState<ActiveClass | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  const pollRef = useRef<number | null>(null);
  const fetchSeqRef = useRef(0);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);

  const myShort = useMemo(() => (deviceId ? deviceId.slice(0, 6) : ""), [deviceId]);

  function scrollToBottom(smooth = true) {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
  }

  async function loadActive() {
    const id = getOrCreateDeviceId();
    setDeviceId(id);

    const r = await fetch("/api/class/active", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: id }),
      cache: "no-store",
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (j?.error === "profile_not_found") {
        window.location.href = "/profile";
        return;
      }
      alert(j?.error ?? "failed");
      return;
    }
    setActiveClass(j.activeClass);
  }

  async function loadMessages(classId: string) {
    const seq = ++fetchSeqRef.current;

    const r = await fetch("/api/class/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ classId, limit: 200 }),
      cache: "no-store",
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) return;

    if (seq !== fetchSeqRef.current) return;

    const incoming: Msg[] = j.messages ?? [];
    setMessages((prev) => mergeMessages(prev, incoming));
  }

  async function refresh() {
    if (!activeClass?.class_id) return;
    await loadMessages(activeClass.class_id);
  }

  async function post() {
    if (!activeClass?.class_id) return;
    const m = text.trim();
    if (!m) return;

    const tempId = `tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const optimistic: Msg = {
      id: tempId,
      class_id: activeClass.class_id,
      device_id: deviceId,
      message: m,
      msg_type: "user",
      created_at: new Date().toISOString(),
    };

    setText("");
    setMessages((prev) => mergeMessages(prev, [optimistic]));
    scrollToBottom(true);

    setPosting(true);
    try {
      const r = await fetch("/api/class/post", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId, classId: activeClass.class_id, message: m }),
        cache: "no-store",
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMessages((prev) => prev.filter((x) => x.id !== tempId));
        alert(j?.error ?? "failed");
        return;
      }

      // DB反映が遅れることがあるので2段階で拾う
      await new Promise((res) => setTimeout(res, 350));
      await refresh();
      setTimeout(() => refresh(), 1400);
    } finally {
      setPosting(false);
    }
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadActive();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeClass?.class_id) return;

    loadMessages(activeClass.class_id);

    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(() => {
      loadMessages(activeClass.class_id);
    }, 3500);

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClass?.class_id]);

  // 自動スクロール（ユーザーが上を見てるときは邪魔しない）
  useEffect(() => {
    if (shouldStickToBottomRef.current) scrollToBottom(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  if (loading) return <main style={{ padding: 16 }}>読み込み中…</main>;

  if (!activeClass) {
    return (
      <main style={{ padding: 16 }}>
        <h1>クラス</h1>
        <p>クラス情報を取得できませんでした。</p>
        <Link href="/class/select">クラス一覧へ</Link>
      </main>
    );
  }

  return (
    <main style={{ padding: 16, maxWidth: 920, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>{activeClass.class_name}</h1>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
            world: {activeClass.world_key ?? "-"} / topic: {activeClass.topic_key ?? "-"} / あなた: {myShort}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Link href="/class/select">転校する</Link>
          <Link href="/room">授業を開始（通話へ）</Link>
        </div>
      </header>

      <section style={{ marginTop: 14, border: "1px solid #e6e6e6", borderRadius: 16, overflow: "hidden" }}>
        {/* ヘッダー */}
        <div style={{ padding: "10px 12px", background: "#f7f7f7", borderBottom: "1px solid #ededed", display: "flex", justifyContent: "space-between" }}>
          <strong>クラスチャット</strong>
          <button onClick={refresh} style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}>
            更新
          </button>
        </div>

        {/* メッセージ面 */}
        <div
          onScroll={(e) => {
            const el = e.currentTarget;
            const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            shouldStickToBottomRef.current = nearBottom;
          }}
          style={{
            height: 420,
            overflowY: "auto",
            padding: 12,
            background: "linear-gradient(#eaf4ff, #f7fbff)",
          }}
        >
          {messages.length === 0 ? (
            <div style={{ opacity: 0.7, padding: 10 }}>まだメッセージがありません。</div>
          ) : (
            messages.map((m) => {
              const isMe = m.msg_type !== "system" && m.device_id === deviceId;
              const isSystem = m.msg_type === "system";

              if (isSystem) {
                return (
                  <div key={m.id} style={{ display: "flex", justifyContent: "center", margin: "10px 0" }}>
                    <div style={{ fontSize: 12, opacity: 0.75, background: "rgba(255,255,255,0.75)", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 999, padding: "6px 10px" }}>
                      {m.message}
                    </div>
                  </div>
                );
              }

              return (
                <div key={m.id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start", marginBottom: 10 }}>
                  <div style={{ maxWidth: "74%", display: "grid", gap: 4 }}>
                    <div style={{ fontSize: 11, opacity: 0.6, textAlign: isMe ? "right" : "left" }}>
                      {isMe ? "あなた" : m.device_id.slice(0, 6)} · {fmtTime(m.created_at)}
                    </div>

                    <div
                      style={{
                        background: isMe ? "#9eea6a" : "#fff",
                        border: "1px solid rgba(0,0,0,0.08)",
                        borderRadius: 18,
                        padding: "10px 12px",
                        whiteSpace: "pre-wrap",
                        boxShadow: "0 1px 0 rgba(0,0,0,0.04)",
                      }}
                    >
                      {m.message}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* 入力欄 */}
        <div style={{ padding: 10, background: "#f7f7f7", borderTop: "1px solid #ededed", display: "flex", gap: 8 }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="メッセージ…（Enterで送信 / Shift+Enterで改行）"
            rows={1}
            style={{
              flex: 1,
              resize: "none",
              padding: "10px 12px",
              borderRadius: 14,
              border: "1px solid #ddd",
              outline: "none",
            }}
            maxLength={1000}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!posting) post();
              }
            }}
          />
          <button
            onClick={post}
            disabled={posting}
            style={{
              padding: "10px 14px",
              borderRadius: 14,
              border: "none",
              background: posting ? "#888" : "#111",
              color: "#fff",
              fontWeight: 800,
              cursor: posting ? "not-allowed" : "pointer",
            }}
          >
            {posting ? "…" : "送信"}
          </button>
        </div>
      </section>


    
    </main>
  );
}
