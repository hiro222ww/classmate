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
  kind: "play" | "pause" | "seek" | "video_change";
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

  const stateRef = useRef<YoutubeState | null>(null);
  const activeVideoIdRef = useRef("");
  const lastAppliedRef = useRef("");
  const allowPlayUntilRef = useRef(0);
  const recreateNonceRef = useRef(0);

  const [input, setInput] = useState("");
  const [state, setState] = useState<YoutubeState | null>(null);
  const [error, setError] = useState("");
  const [needsUserPlay, setNeedsUserPlay] = useState(false);
  const [playerKey, setPlayerKey] = useState(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const destroyPlayer = useCallback(() => {
    try {
      playerRef.current?.destroy?.();
    } catch {
      // ignore
    }

    playerRef.current = null;

    if (containerRef.current) {
      containerRef.current.innerHTML = "";
    }
  }, []);

  const forceRecreatePlayer = useCallback(() => {
    recreateNonceRef.current += 1;
    setPlayerKey(recreateNonceRef.current);
  }, []);

  const saveStateToDb = useCallback(
    async (patch: Partial<YoutubeState>) => {
      if (!sessionId) return;

      const current = stateRef.current;

      const next: YoutubeState = {
        session_id: sessionId,
        url: patch.url ?? current?.url ?? "",
        video_id: patch.video_id ?? current?.video_id ?? "",
        status: patch.status ?? current?.status ?? "paused",
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
    async (payload: Omit<YoutubeBroadcastPayload, "fromDeviceId" | "sentAt">) => {
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

      const elapsed = Math.max(0, (Date.now() - payload.sentAt) / 1000);
      const compensatedTime =
        payload.status === "playing"
          ? Number(payload.playheadSeconds ?? 0) + elapsed
          : Number(payload.playheadSeconds ?? 0);

      const current = stateRef.current;

      const next: YoutubeState = {
        session_id: sessionId,
        url: current?.url ?? "",
        video_id: payload.videoId,
        status: payload.status,
        playhead_seconds: compensatedTime,
        updated_by: payload.fromDeviceId,
        updated_at: new Date().toISOString(),
      };

      stateRef.current = next;
      setState(next);

      const player = playerRef.current;

      if (!player) {
        activeVideoIdRef.current = payload.videoId;
        forceRecreatePlayer();
        return;
      }

      try {
        const currentVideoId = player.getVideoData?.()?.video_id ?? "";

        if (currentVideoId !== payload.videoId) {
          activeVideoIdRef.current = payload.videoId;
          destroyPlayer();
          forceRecreatePlayer();
          return;
        }

        if (payload.status === "playing") {
          allowPlayUntilRef.current = Date.now() + 4000;

          const currentTime = Number(player.getCurrentTime?.() ?? 0);
          if (Math.abs(currentTime - compensatedTime) > 1.5) {
            player.seekTo(compensatedTime, true);
          }

          window.setTimeout(() => {
            try {
              player.playVideo?.();
              setNeedsUserPlay(false);
            } catch {
              setNeedsUserPlay(true);
            }
          }, 150);
        } else {
          player.pauseVideo?.();
          setNeedsUserPlay(false);

          const currentTime = Number(player.getCurrentTime?.() ?? 0);
          if (Math.abs(currentTime - compensatedTime) > 2) {
            player.seekTo(compensatedTime, true);
          }
        }
      } catch (e) {
        console.warn("[youtube] apply broadcast failed", e);
      }
    },
    [deviceId, sessionId, destroyPlayer, forceRecreatePlayer]
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

        const next: YoutubeState = {
          ...row,
          status: "paused",
          playhead_seconds: Number(row.playhead_seconds ?? 0),
        };

        stateRef.current = next;
        setState(next);
        activeVideoIdRef.current = next.video_id;
        forceRecreatePlayer();
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
      destroyPlayer();
      void supabase.removeChannel(channel);
    };
  }, [
    sessionId,
    applyRemoteState,
    destroyPlayer,
    forceRecreatePlayer,
  ]);

  useEffect(() => {
    if (!state?.video_id) return;
    if (!containerRef.current) return;

    let cancelled = false;
    const videoId = state.video_id;
    const startSeconds = Number(state.playhead_seconds ?? 0);

    async function setupPlayer() {
      await loadYouTubeApi();
      if (cancelled || !containerRef.current || !videoId) return;

      activeVideoIdRef.current = videoId;
      destroyPlayer();

      console.log("[youtube] create player", {
        videoId,
        startSeconds,
        playerKey,
      });

      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId,
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
            if (cancelled) return;

            const player = playerRef.current;
            if (!player) return;

            try {
              player.cueVideoById(videoId, startSeconds);
              player.pauseVideo?.();
              setNeedsUserPlay(false);
            } catch (e) {
              console.warn("[youtube] ready cue failed", e);
            }
          },

          onStateChange: (event: any) => {
            // 重要：
            // YouTube側のPLAYING/PAUSEDイベントではDB更新・broadcastしない。
            // ここで保存すると古いplayerや謎イベントでゾンビ動画が復活する。
            const player = playerRef.current;
            const playerVideoId = player?.getVideoData?.()?.video_id ?? "";

            console.log("[youtube] state event ignored", {
              eventData: event?.data,
              playerVideoId,
              activeVideoId: activeVideoIdRef.current,
            });

            const isPlaying = event?.data === window.YT?.PlayerState?.PLAYING;
            const allowed = Date.now() < allowPlayUntilRef.current;

            if (isPlaying && !allowed) {
              try {
                player?.pauseVideo?.();
              } catch {
                // ignore
              }
            }
          },
        },
      });
    }

    void setupPlayer();

    return () => {
      cancelled = true;
      destroyPlayer();
    };
  }, [state?.video_id, playerKey, destroyPlayer]);

  async function openUrl() {
    const url = input.trim();
    const videoId = extractYouTubeId(url);

    if (!videoId) {
      setError("YouTubeのURLを認識できません");
      return;
    }

    setError("");
    setNeedsUserPlay(false);

    activeVideoIdRef.current = videoId;
    destroyPlayer();

    await saveStateToDb({
      url,
      video_id: videoId,
      status: "paused",
      playhead_seconds: 0,
    });

    forceRecreatePlayer();

    await sendYoutubeBroadcast({
      kind: "video_change",
      videoId,
      status: "paused",
      playheadSeconds: 0,
    });
  }

  async function sendManualSync() {
    const current = stateRef.current;
    if (!current?.video_id) return;

    const player = playerRef.current;
    const videoId = current.video_id;

    let t = Number(current.playhead_seconds ?? 0);

    try {
      const playerVideoId = player?.getVideoData?.()?.video_id ?? "";
      if (player && (!playerVideoId || playerVideoId === videoId)) {
        t = Number(player.getCurrentTime?.() ?? t);
      }
    } catch {
      // ignore
    }

    allowPlayUntilRef.current = Date.now() + 4000;

    await saveStateToDb({
      video_id: videoId,
      status: "playing",
      playhead_seconds: t,
    });

    await sendYoutubeBroadcast({
      kind: "play",
      videoId,
      status: "playing",
      playheadSeconds: t,
    });

    try {
      if (!playerRef.current) {
        forceRecreatePlayer();
        setNeedsUserPlay(true);
        return;
      }

      playerRef.current.seekTo?.(t, true);
      playerRef.current.playVideo?.();
      setNeedsUserPlay(false);
    } catch {
      setNeedsUserPlay(true);
    }
  }

  async function sendManualPause() {
    const current = stateRef.current;
    const player = playerRef.current;

    if (!current?.video_id) return;

    let t = Number(current.playhead_seconds ?? 0);

    try {
      t = Number(player?.getCurrentTime?.() ?? t);
      player?.pauseVideo?.();
    } catch {
      // ignore
    }

    await saveStateToDb({
      video_id: current.video_id,
      status: "paused",
      playhead_seconds: t,
    });

    await sendYoutubeBroadcast({
      kind: "pause",
      videoId: current.video_id,
      status: "paused",
      playheadSeconds: t,
    });

    setNeedsUserPlay(false);
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
              key={`${state.video_id}-${playerKey}`}
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
              再生を同期
            </button>

            <button
              type="button"
              onClick={() => void sendManualPause()}
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
              停止を同期
            </button>

            {needsUserPlay && (
              <button
                type="button"
                onClick={() => {
                  const player = playerRef.current;
                  if (!player) return;

                  allowPlayUntilRef.current = Date.now() + 4000;

                  try {
                    player.playVideo?.();
                    setNeedsUserPlay(false);
                  } catch {
                    setNeedsUserPlay(true);
                  }
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