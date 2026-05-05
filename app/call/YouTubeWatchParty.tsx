"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Props = {
  sessionId: string;
  deviceId: string;
};

type YoutubeStatus = "paused";

type YoutubeState = {
  session_id: string;
  url: string;
  video_id: string;
  status: YoutubeStatus;
  playhead_seconds: number;
  updated_by: string | null;
  updated_at: string;
};

type YoutubeBroadcastPayload = {
  kind: "video_change" | "sync_time";
  videoId: string;
  playheadSeconds: number;
  fromDeviceId: string;
  sentAt: number;
};

function extractYouTubeId(input: string) {
  const raw = input.trim();
  if (!raw) return "";

  try {
    const u = new URL(raw);

    if (u.hostname.includes("youtu.be")) {
      return u.pathname.replace("/", "").split("?")[0];
    }

    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;

      if (u.pathname.startsWith("/shorts/")) {
        return u.pathname.replace("/shorts/", "").split("/")[0];
      }

      if (u.pathname.startsWith("/embed/")) {
        return u.pathname.replace("/embed/", "").split("/")[0];
      }
    }

    return "";
  } catch {
    return "";
  }
}

function buildEmbedUrl(videoId: string, startSeconds: number) {
  const start = Math.max(0, Math.floor(startSeconds || 0));

  const params = new URLSearchParams({
    start: String(start),
    autoplay: "0",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
    iv_load_policy: "3",
  });

  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

export default function YouTubeWatchParty({ sessionId, deviceId }: Props) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const stateRef = useRef<YoutubeState | null>(null);
  const lastAppliedRef = useRef("");

  const [input, setInput] = useState("");
  const [state, setState] = useState<YoutubeState | null>(null);
  const [error, setError] = useState("");
  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const bumpIframe = useCallback(() => {
    setIframeKey((v) => v + 1);
  }, []);

  const saveStateToDb = useCallback(
    async (patch: Partial<YoutubeState>) => {
      if (!sessionId) return;

      const current = stateRef.current;

      const next: YoutubeState = {
        session_id: sessionId,
        url: patch.url ?? current?.url ?? "",
        video_id: patch.video_id ?? current?.video_id ?? "",
        status: "paused",
        playhead_seconds:
          typeof patch.playhead_seconds === "number"
            ? patch.playhead_seconds
            : current?.playhead_seconds ?? 0,
        updated_by: deviceId,
        updated_at: new Date().toISOString(),
      };

      stateRef.current = next;
      setState(next);

      const { error } = await supabase
        .from("session_youtube_state")
        .upsert(next, { onConflict: "session_id" });

      if (error) {
        console.warn("[youtube] db save failed", error);
        setError(error.message);
      }
    },
    [sessionId, deviceId]
  );

  const sendYoutubeBroadcast = useCallback(
    async (
      payload: Omit<YoutubeBroadcastPayload, "fromDeviceId" | "sentAt">
    ) => {
      await channelRef.current?.send({
        type: "broadcast",
        event: "youtube-sync",
        payload: {
          ...payload,
          fromDeviceId: deviceId,
          sentAt: Date.now(),
        },
      });
    },
    [deviceId]
  );

  const applyRemoteState = useCallback(
    (payload: YoutubeBroadcastPayload) => {
      if (!payload?.videoId) return;
      if (payload.fromDeviceId === deviceId) return;

      const key = `${payload.fromDeviceId}:${payload.sentAt}`;
      if (lastAppliedRef.current === key) return;
      lastAppliedRef.current = key;

      const next: YoutubeState = {
        session_id: sessionId,
        url: stateRef.current?.url ?? "",
        video_id: payload.videoId,
        status: "paused",
        playhead_seconds: Number(payload.playheadSeconds ?? 0),
        updated_by: payload.fromDeviceId,
        updated_at: new Date().toISOString(),
      };

      stateRef.current = next;
      setState(next);
      bumpIframe();

      console.log("[youtube] remote applied", {
        kind: payload.kind,
        videoId: payload.videoId,
        playheadSeconds: payload.playheadSeconds,
      });
    },
    [deviceId, sessionId, bumpIframe]
  );

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;

    async function load() {
      const { data, error } = await supabase
        .from("session_youtube_state")
        .select("*")
        .eq("session_id", sessionId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.warn("[youtube] load failed", error);
        setError(error.message);
        return;
      }

      if (data) {
        const row = data as YoutubeState;

        const next: YoutubeState = {
          session_id: sessionId,
          url: row.url ?? "",
          video_id: row.video_id ?? "",
          status: "paused",
          playhead_seconds: Number(row.playhead_seconds ?? 0),
          updated_by: row.updated_by ?? null,
          updated_at: row.updated_at ?? new Date().toISOString(),
        };

        stateRef.current = next;
        setState(next);
        bumpIframe();
      }
    }

    void load();

    const channel = supabase
      .channel(`session-youtube-${sessionId}`)
      .on("broadcast", { event: "youtube-sync" }, ({ payload }) => {
        applyRemoteState(payload as YoutubeBroadcastPayload);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      cancelled = true;
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [sessionId, applyRemoteState, bumpIframe]);

  async function openUrl() {
    const url = input.trim();
    const videoId = extractYouTubeId(url);

    if (!videoId) {
      setError("YouTubeのURLを認識できません");
      return;
    }

    setError("");

    await saveStateToDb({
      url,
      video_id: videoId,
      status: "paused",
      playhead_seconds: 0,
    });

    bumpIframe();

    await sendYoutubeBroadcast({
      kind: "video_change",
      videoId,
      playheadSeconds: 0,
    });
  }

  async function syncFromSeconds(seconds: number) {
    const current = stateRef.current;
    if (!current?.video_id) return;

    const t = Math.max(0, Math.floor(seconds || 0));

    await saveStateToDb({
      video_id: current.video_id,
      status: "paused",
      playhead_seconds: t,
    });

    bumpIframe();

    await sendYoutubeBroadcast({
      kind: "sync_time",
      videoId: current.video_id,
      playheadSeconds: t,
    });
  }

  const currentStartSeconds = Number(state?.playhead_seconds ?? 0);
  const iframeSrc = state?.video_id
    ? buildEmbedUrl(state.video_id, currentStartSeconds)
    : "";

  return (
    <section
      style={{
        marginTop: 16,
        padding: 14,
        border: "1px solid #e5e7eb",
        borderRadius: 18,
        background: "#fff",
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 15 }}>一緒に見る</div>

      <div
        style={{
          marginTop: 10,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="YouTubeのURLを貼る"
          style={{
            flex: 1,
            minWidth: 220,
            border: "1px solid #d1d5db",
            borderRadius: 999,
            padding: "10px 12px",
          }}
        />

        <button
          type="button"
          onClick={() => void openUrl()}
          disabled={!input.trim()}
          style={{
            padding: "10px 14px",
            borderRadius: 999,
            border: "1px solid #111",
            background: input.trim() ? "#111" : "#9ca3af",
            color: "#fff",
            fontWeight: 900,
            cursor: input.trim() ? "pointer" : "not-allowed",
          }}
        >
          共有
        </button>
      </div>

      {error ? (
        <div
          style={{
            marginTop: 10,
            color: "#991b1b",
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          {error}
        </div>
      ) : null}

      {state?.video_id ? (
        <>
          <div
            style={{
              marginTop: 14,
              borderRadius: 18,
              overflow: "hidden",
              background: "#000",
              aspectRatio: "16 / 9",
              width: "100%",
            }}
          >
            <iframe
              key={`${state.video_id}-${currentStartSeconds}-${iframeKey}`}
              src={iframeSrc}
              title="YouTube Watch Party"
              allow="encrypted-media; picture-in-picture"
              allowFullScreen
              style={{
                width: "100%",
                height: "100%",
                border: 0,
                display: "block",
              }}
            />
          </div>

          <div
            style={{
              marginTop: 8,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <button
              type="button"
              onClick={() => void syncFromSeconds(currentStartSeconds)}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid #d1d5db",
                background: "#fff",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              この位置に同期
            </button>

            <button
              type="button"
              onClick={() => void syncFromSeconds(currentStartSeconds + 10)}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid #d1d5db",
                background: "#fff",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              +10秒
            </button>

            <button
              type="button"
              onClick={() => void syncFromSeconds(Math.max(0, currentStartSeconds - 10))}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid #d1d5db",
                background: "#fff",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              -10秒
            </button>

            <span
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: "#6b7280",
              }}
            >
              開始位置: {Math.floor(currentStartSeconds)}秒
            </span>
          </div>
        </>
      ) : (
        <div
          style={{
            marginTop: 12,
            padding: 14,
            borderRadius: 16,
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            color: "#6b7280",
            fontWeight: 800,
            fontSize: 13,
          }}
        >
          YouTubeのURLを共有すると、同じ動画が全員に表示されます。
        </div>
      )}
    </section>
  );
}