"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

type Props = {
  sessionId: string;
  deviceId: string;
};

type YoutubeStatus = "playing" | "paused";

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
  kind: "play" | "pause" | "seek" | "heartbeat";
  videoId: string;
  status: YoutubeStatus;
  playheadSeconds: number;
  fromDeviceId: string;
  sentAt: number;
};

let ytApiPromise: Promise<void> | null = null;

function loadYouTubeApi() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();

  if (!ytApiPromise) {
    ytApiPromise = new Promise<void>((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;

      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve();
      };

      const existing = document.querySelector(
        'script[src="https://www.youtube.com/iframe_api"]'
      );

      if (!existing) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        document.body.appendChild(script);
      }
    });
  }

  return ytApiPromise;
}

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

export default function YouTubeWatchParty({ sessionId, deviceId }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const lastAppliedRef = useRef("");
  const suppressEventRef = useRef(false);
  const lastBroadcastAtRef = useRef(0);
  const lastSavedAtRef = useRef(0);
  const allowPlayUntilRef = useRef(0);

  const [input, setInput] = useState("");
  const [state, setState] = useState<YoutubeState | null>(null);
  const [error, setError] = useState("");
  const [needsUserPlay, setNeedsUserPlay] = useState(false);

  const saveStateToDb = useCallback(
    async (patch: Partial<YoutubeState>) => {
      if (!sessionId) return;

      const next: YoutubeState = {
        session_id: sessionId,
        url: patch.url ?? state?.url ?? "",
        video_id: patch.video_id ?? state?.video_id ?? "",
        status: patch.status ?? state?.status ?? "paused",
        playhead_seconds:
          typeof patch.playhead_seconds === "number"
            ? patch.playhead_seconds
            : state?.playhead_seconds ?? 0,
        updated_by: deviceId,
        updated_at: new Date().toISOString(),
      };

      setState(next);

      const { error } = await supabase
        .from("session_youtube_state")
        .upsert(next, { onConflict: "session_id" });

      if (error) {
        console.warn("[youtube] db save failed", error);
        setError(error.message);
      }
    },
    [sessionId, deviceId, state]
  );

  const sendBroadcast = useCallback(
    async (
      kind: YoutubeBroadcastPayload["kind"],
      patch?: Partial<YoutubeBroadcastPayload>
    ) => {
      const channel = channelRef.current;
      const current = state;
      const player = playerRef.current;

      if (!channel || !current?.video_id) return;

      const now = Date.now();

      if (kind === "heartbeat" && now - lastBroadcastAtRef.current < 9000) {
        return;
      }

      lastBroadcastAtRef.current = now;

      const playheadSeconds =
        typeof patch?.playheadSeconds === "number"
          ? patch.playheadSeconds
          : Number(player?.getCurrentTime?.() ?? current.playhead_seconds ?? 0);

      const payload: YoutubeBroadcastPayload = {
        kind,
        videoId: patch?.videoId ?? current.video_id,
        status: patch?.status ?? current.status,
        playheadSeconds,
        fromDeviceId: deviceId,
        sentAt: now,
      };

      await channel.send({
        type: "broadcast",
        event: "youtube-sync",
        payload,
      });
    },
    [deviceId, state]
  );

  const applyRemoteState = useCallback(
  (payload: YoutubeBroadcastPayload) => {
    if (!payload?.videoId) return;
    if (payload.fromDeviceId === deviceId) return;

    const key = `${payload.fromDeviceId}:${payload.sentAt}`;
    if (lastAppliedRef.current === key) return;
    lastAppliedRef.current = key;

    const player = playerRef.current;
    if (!player) return;

    try {
      const currentVideoId = player.getVideoData?.()?.video_id;
      const currentTime = Number(player.getCurrentTime?.() ?? 0);
      const targetTime = Number(payload.playheadSeconds ?? 0);
      const elapsed = Math.max(0, (Date.now() - payload.sentAt) / 1000);
      const compensatedTime =
        payload.status === "playing" ? targetTime + elapsed : targetTime;

      setState((prev) => ({
        session_id: sessionId,
        url: prev?.url ?? "",
        video_id: payload.videoId,
        status: payload.status,
        playhead_seconds: compensatedTime,
        updated_by: payload.fromDeviceId,
        updated_at: new Date().toISOString(),
      }));

      suppressEventRef.current = true;

      if (currentVideoId !== payload.videoId) {
        player.cueVideoById(payload.videoId, compensatedTime);
      } else if (Math.abs(currentTime - compensatedTime) > 2) {
        player.seekTo(compensatedTime, true);
      }

      if (payload.status === "playing") {
        allowPlayUntilRef.current = Date.now() + 3000;

        window.setTimeout(() => {
          suppressEventRef.current = false;
          player.playVideo?.();
          setNeedsUserPlay(false);
        }, 150);
      } else {
        player.pauseVideo?.();
        setNeedsUserPlay(false);

        window.setTimeout(() => {
          suppressEventRef.current = false;
        }, 1500);
      }
    } catch (e) {
      console.warn("[youtube] apply broadcast failed", e);
      suppressEventRef.current = false;
    }
  },
  [deviceId, sessionId]
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
        return;
      }

      if (data) {
        const row = data as YoutubeState;

        setState({
          ...row,
          status: "paused",
        });
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
  }, [sessionId, applyRemoteState]);

  useEffect(() => {
    if (!state?.video_id) return;
    if (!containerRef.current) return;

    let cancelled = false;

    async function setupPlayer() {
      await loadYouTubeApi();
      if (cancelled || !containerRef.current || !state?.video_id) return;

      if (!playerRef.current) {
        playerRef.current = new window.YT.Player(containerRef.current, {
          videoId: state.video_id,
          width: "100%",
          height: "100%",
          playerVars: {
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            iv_load_policy: 3,
            fs: 0,
            disablekb: 1,
            autoplay: 0,
          },
          events: {
            onReady: () => {
              const player = playerRef.current;
              if (!player) return;

              suppressEventRef.current = true;

              try {
                player.cueVideoById(state.video_id, state.playhead_seconds ?? 0);
                player.pauseVideo?.();
              } catch {}

              window.setTimeout(() => {
                suppressEventRef.current = false;
              }, 1500);
            },

            onStateChange: async (event: any) => {
  if (suppressEventRef.current) return;

  const player = playerRef.current;
  if (!player) return;

  const t = Number(player.getCurrentTime?.() ?? 0);

  if (event.data === window.YT.PlayerState.PLAYING) {
    const allowed = Date.now() < allowPlayUntilRef.current;

    if (!allowed) {
      suppressEventRef.current = true;
      player.pauseVideo?.();

      window.setTimeout(() => {
        suppressEventRef.current = false;
      }, 800);

      setNeedsUserPlay(false);
      return;
    }

    await saveStateToDb({
      status: "playing",
      playhead_seconds: t,
    });

    // 自分が許可して始めた再生だけDB保存。remote同期の再broadcastはしない。
if (Date.now() < allowPlayUntilRef.current) {
  await saveStateToDb({
    status: "playing",
    playhead_seconds: t,
  });
}

return;
  }

  if (event.data === window.YT.PlayerState.PAUSED) {
    await saveStateToDb({
      status: "paused",
      playhead_seconds: t,
    });

    await sendBroadcast("pause", {
      status: "paused",
      playheadSeconds: t,
    });
  }
},
          },
        });
      } else {
        const player = playerRef.current;
        const currentVideoId = player.getVideoData?.()?.video_id;

        if (currentVideoId !== state.video_id) {
          suppressEventRef.current = true;

          try {
            player.cueVideoById(state.video_id, state.playhead_seconds ?? 0);
            player.pauseVideo?.();
          } catch {}

          window.setTimeout(() => {
            suppressEventRef.current = false;
          }, 1500);
        }
      }
    }

    void setupPlayer();

    return () => {
      cancelled = true;
    };
  }, [state?.video_id, state?.playhead_seconds, saveStateToDb, sendBroadcast]);

  useEffect(() => {
    if (!state?.video_id) return;
    if (state.status !== "playing") return;

    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;

      const t = Number(player.getCurrentTime?.() ?? 0);

      void sendBroadcast("heartbeat", {
        status: "playing",
        playheadSeconds: t,
      });

      const now = Date.now();

      if (now - lastSavedAtRef.current > 30000) {
        lastSavedAtRef.current = now;

        void saveStateToDb({
          status: "playing",
          playhead_seconds: t,
        });
      }
    }, 10000);

    return () => {
      window.clearInterval(timer);
    };
  }, [state?.video_id, state?.status, sendBroadcast, saveStateToDb]);

  async function openUrl() {
    const url = input.trim();
    const videoId = extractYouTubeId(url);

    if (!videoId) {
      setError("YouTubeのURLを認識できません");
      return;
    }

    setError("");
    setNeedsUserPlay(false);

    suppressEventRef.current = true;

    const player = playerRef.current;
    if (player) {
      try {
        player.cueVideoById(videoId, 0);
        player.pauseVideo?.();
      } catch {}
    }

    await saveStateToDb({
      url,
      video_id: videoId,
      status: "paused",
      playhead_seconds: 0,
    });

    await sendBroadcast("pause", {
      videoId,
      status: "paused",
      playheadSeconds: 0,
    });

    window.setTimeout(() => {
      suppressEventRef.current = false;
    }, 1500);
  }

  async function sendManualSync() {
    const player = playerRef.current;
    const current = state;

    if (!player || !current?.video_id) return;

    const t = Number(player.getCurrentTime?.() ?? 0);

    await saveStateToDb({
      status: "paused",
      playhead_seconds: t,
    });

    await sendBroadcast("seek", {
      status: "paused",
      playheadSeconds: t,
    });
  }

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
            <div
              ref={containerRef}
              style={{
                width: "100%",
                height: "100%",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => void sendManualSync()}
              style={{
                marginTop: 8,
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid #d1d5db",
                background: "#fff",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              今の再生位置を同期
            </button>

            {needsUserPlay && (
              <button
                type="button"
                onClick={() => {
                  const player = playerRef.current;
                  if (!player) return;

                  allowPlayUntilRef.current = Date.now() + 3000;
player.playVideo?.();
setNeedsUserPlay(false);
                }}
                style={{
                  marginTop: 8,
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: "1px solid #111827",
                  background: "#111827",
                  color: "#fff",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                ▶ 同期再生を開始
              </button>
            )}
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