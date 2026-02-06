// app/call/CallClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

function getOrCreateDeviceId(): string {
  const key = "device_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

type SignalBase = { from: string };
type Signal =
  | (SignalBase & { type: "join" })
  | (SignalBase & { type: "offer"; sdp: RTCSessionDescriptionInit })
  | (SignalBase & { type: "answer"; sdp: RTCSessionDescriptionInit })
  | (SignalBase & { type: "ice"; candidate: RTCIceCandidateInit })
  | (SignalBase & { type: "leave" });

type DistributiveOmit<T, K extends PropertyKey> = T extends any ? Omit<T, K> : never;
type OutSignal = DistributiveOmit<Signal, "from">;

function hasGetUserMedia(): boolean {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

async function readJsonOrThrow(r: Response) {
  const ct = r.headers.get("content-type") ?? "";
  const raw = await r.text();
  if (!ct.includes("application/json")) {
    console.error("Non-JSON response:", raw);
    throw new Error("non_json_response");
  }
  const j = JSON.parse(raw);
  if (!r.ok) throw new Error(j?.error ?? "request_failed");
  return j;
}

export default function CallClient() {
  const router = useRouter();

  const myId = useMemo(() => (typeof window !== "undefined" ? getOrCreateDeviceId() : ""), []);
  const [sessionId, setSessionId] = useState(""); // ✅ URL不要：ここで作る
  const channelName = useMemo(() => (sessionId ? `session:${sessionId}` : ""), [sessionId]);

  const channelRef = useRef<ReturnType<typeof supabaseBrowser.channel> | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const [status, setStatus] = useState<
    "searching" | "idle" | "init" | "ready" | "connecting" | "connected" | "ended"
  >("searching");

  const [micOn, setMicOn] = useState(true);
  const [remoteReady, setRemoteReady] = useState(false);
  const [error, setError] = useState("");
  const [micGranted, setMicGranted] = useState(false);

  // 「どっちがoffer出すか」：安定させるために文字列比較
  const shouldOffer = (peerId: string) => myId && myId < peerId;

  function send(payload: OutSignal) {
    const ch = channelRef.current;
    if (!ch) return;
    const msg: Signal = { ...(payload as any), from: myId };
    ch.send({ type: "broadcast", event: "signal", payload: msg });
  }

  // ✅ 1) セッションを自動で作る/参加する（sessionId を取得）
  useEffect(() => {
    if (!myId) return;
    if (sessionId) return;

    let cancelled = false;

    (async () => {
      try {
        setError("");
        setStatus("searching");

        // ★ 今は仮：後で「所属クラス/テーマ」に連動させる
        const topic = "default";
        // ★ name は今のあなたのAPIでは p_name 扱い。deviceIdでOK
        const name = myId;
        // ★ まずは2人通話が確実（後で可変にできる）
        const capacity = 2;

        const r = await fetch("/api/session/join", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ topic, name, capacity }),
        });

        const j = await readJsonOrThrow(r);

        if (cancelled) return;
        if (!j?.sessionId) throw new Error("sessionId_missing");

        setSessionId(String(j.sessionId));
        setStatus("idle"); // session取れた。次はマイク許可へ
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "session init failed");
          setStatus("idle");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [myId, sessionId]);

  async function requestMic() {
    setError("");

    if (!hasGetUserMedia()) {
      setError(
        "このブラウザではマイク通話が使えません（navigator.mediaDevices.getUserMedia がありません）。Safari（通常のブラウザ）で開くか、PCで試してください。"
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setMicGranted(true);
      setStatus("init");
    } catch (e: any) {
      setError(e?.message ?? "マイクの許可に失敗しました");
    }
  }

  function createPeerConnection() {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) send({ type: "ice", candidate: e.candidate.toJSON() });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setStatus("connected");
    };

    pc.ontrack = (e) => {
      const [stream] = e.streams;
      if (remoteAudioRef.current && stream) {
        remoteAudioRef.current.srcObject = stream;
        remoteAudioRef.current.play().catch(() => {});
      }
    };

    pcRef.current = pc;
    return pc;
  }

  async function startOffer() {
    try {
      setStatus("connecting");
      const stream = localStreamRef.current!;
      const pc = pcRef.current ?? createPeerConnection();

      if (pc.getSenders().length === 0) {
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send({ type: "offer", sdp: offer });
    } catch (e: any) {
      setError(e?.message ?? "offer failed");
    }
  }

  async function handleOffer(from: string, sdp: RTCSessionDescriptionInit) {
    try {
      setStatus("connecting");
      const stream = localStreamRef.current!;
      const pc = pcRef.current ?? createPeerConnection();

      if (pc.getSenders().length === 0) {
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      }

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send({ type: "answer", sdp: answer });
    } catch (e: any) {
      setError(e?.message ?? "handleOffer failed");
    }
  }

  async function handleAnswer(sdp: RTCSessionDescriptionInit) {
    try {
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    } catch (e: any) {
      setError(e?.message ?? "handleAnswer failed");
    }
  }

  async function handleIce(candidate: RTCIceCandidateInit) {
    try {
      const pc = pcRef.current;
      if (!pc) return;
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {
      // timingズレは無視
    }
  }

  async function toggleMic() {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !micOn;
    stream.getAudioTracks().forEach((t) => (t.enabled = next));
    setMicOn(next);
  }

  async function leave() {
    try {
      send({ type: "leave" });
    } catch {}

    try {
      channelRef.current?.unsubscribe();
    } catch {}
    channelRef.current = null;

    try {
      pcRef.current?.close();
    } catch {}
    pcRef.current = null;

    try {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    localStreamRef.current = null;

    setStatus("ended");
    router.push("/room");
  }

  // ✅ 2) マイク許可が取れてから、Realtime + WebRTC を開始
  useEffect(() => {
    if (!sessionId) return;
    if (!micGranted) return;

    let cancelled = false;

    (async () => {
      try {
        setError("");

        const ch = supabaseBrowser.channel(channelName);
        channelRef.current = ch;

        ch.on("broadcast", { event: "signal" }, async ({ payload }) => {
          if (cancelled) return;
          const msg = payload as Signal;
          if (!msg || msg.from === myId) return;

          if (msg.type === "join") {
            setRemoteReady(true);
            if (shouldOffer(msg.from)) {
              setTimeout(() => {
                if (!pcRef.current) startOffer();
              }, 150);
            }
            return;
          }

          if (msg.type === "offer") return handleOffer(msg.from, msg.sdp);
          if (msg.type === "answer") return handleAnswer(msg.sdp);
          if (msg.type === "ice") return handleIce(msg.candidate);
          if (msg.type === "leave") {
            try {
              pcRef.current?.close();
            } catch {}
            pcRef.current = null;
            setRemoteReady(false);
            setStatus("ready");
          }
        });

        ch.subscribe((st) => {
          if (cancelled) return;
          if (st === "SUBSCRIBED") {
            setStatus("ready");
            send({ type: "join" });
          }
          if (st === "CHANNEL_ERROR" || st === "TIMED_OUT" || st === "CLOSED") {
            setError(`Realtime subscribe failed: ${st}`);
          }
        });
      } catch (e: any) {
        setError(e?.message ?? "call init failed");
      }
    })();

    return () => {
      cancelled = true;
      try {
        channelRef.current?.unsubscribe();
      } catch {}
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, micGranted, channelName, myId]);

  // ---------- UI ----------
  if (!sessionId) {
    // ✅ sessionId 取得中：探しています画面
    return (
      <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12 }}>
        <p style={{ margin: 0, fontWeight: 800 }}>メンバーを探しています…</p>
        <p style={{ margin: "6px 0 0", color: "#666", fontSize: 12 }}>
          条件に合う相手が見つかると通話が始まります。
        </p>
        {error && <p style={{ margin: "8px 0 0", color: "#b00020", fontWeight: 700 }}>{error}</p>}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* セッション確保後にだけ見せる（開発中の可視化） */}
      <p style={{ margin: 0 }}>
        セッション：<b style={{ fontFamily: "monospace" }}>{sessionId}</b>
      </p>

      {!micGranted ? (
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12 }}>
          <p style={{ margin: 0, fontWeight: 800 }}>マイクを有効にしてください</p>
          <p style={{ margin: "6px 0 0", color: "#666", fontSize: 12 }}>
            iPhoneでは「ボタンを押したタイミング」でないとマイク許可が通らないことがあります。
          </p>

          {error && <p style={{ margin: "8px 0 0", color: "#b00020", fontWeight: 700 }}>{error}</p>}

          <button
            onClick={requestMic}
            style={{
              marginTop: 10,
              width: "100%",
              padding: 12,
              borderRadius: 10,
              border: "none",
              background: "#111",
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            マイクを有効にする
          </button>

          <p style={{ margin: "10px 0 0", fontSize: 12, color: "#666" }}>
            ※ もしLINE/Instagram内ブラウザで開いているなら、Safariで開き直してください。
          </p>
        </div>
      ) : (
        <>
          <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12 }}>
            <p style={{ margin: 0, fontWeight: 800 }}>
              状態：
              {status === "ready"
                ? "待機中（相手を待っています）"
                : status === "connecting"
                ? "接続中"
                : status === "connected"
                ? "通話中"
                : status}
            </p>
            <p style={{ margin: "6px 0 0", color: "#666" }}>相手：{remoteReady ? "参加あり" : "未参加"}</p>
            {error && <p style={{ margin: "6px 0 0", color: "#b00020", fontWeight: 700 }}>{error}</p>}
          </div>

          <audio ref={remoteAudioRef} autoPlay playsInline />

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={toggleMic}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 10,
                border: "1px solid #ccc",
                background: "#fff",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {micOn ? "マイクON" : "マイクOFF"}
            </button>

            <button
              onClick={leave}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 10,
                border: "none",
                background: "#111",
                color: "#fff",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              退出
            </button>
          </div>

          <p style={{ margin: 0, fontSize: 12, color: "#666" }}>
            ※ iPhoneは「Safariで開く」「HTTPS」が必要な場合があります。まずはPC同士で通話成立を確認すると切り分けが早いです。
          </p>
        </>
      )}
    </div>
  );
}
