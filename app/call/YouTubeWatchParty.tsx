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

type YoutubeState = {
  session_id: string;
  url: string;
  video_id: string;
  status: "playing" | "paused";
  playhead_seconds: number;
  updated_by: string | null;
  updated_at: string;
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
  const lastAppliedRef = useRef("");
  const suppressEventRef = useRef(false);

  const [input, setInput] = useState("");
  const [state, setState] = useState<YoutubeState | null>(null);
  const [error, setError] = useState("");

  const syncState = useCallback(
    async (patch: Partial<YoutubeState>) => {
      if (!sessionId) return;

      const current = state;

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

      const { error } = await supabase
        .from("session_youtube_state")
        .upsert(next, { onConflict: "session_id" });

      if (error) {
        console.warn("[youtube] sync failed", error);
        setError(error.message);
      }
    },
    [sessionId, deviceId, state]
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

      if (data) setState(data as YoutubeState);
    }

    void load();

    const channel = supabase
      .channel(`session-youtube-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_youtube_state",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as YoutubeState;
          if (!row?.session_id) return;
          setState(row);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [sessionId]);

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
          },
          events: {
            onStateChange: async (event: any) => {
              if (suppressEventRef.current) return;

              const player = playerRef.current;
              if (!player) return;

              const t = Number(player.getCurrentTime?.() ?? 0);

              if (event.data === window.YT.PlayerState.PLAYING) {
                await syncState({
                  status: "playing",
                  playhead_seconds: t,
                });
              }

              if (event.data === window.YT.PlayerState.PAUSED) {
                await syncState({
                  status: "paused",
                  playhead_seconds: t,
                });
              }
            },
          },
        });
      }
    }

    void setupPlayer();

    return () => {
      cancelled = true;
    };
  }, [state?.video_id, syncState]);

  useEffect(() => {
    const current = state;
    const player = playerRef.current;

    if (!player || !current?.video_id) return;

    const key = `${current.video_id}:${current.status}:${Math.round(
      current.playhead_seconds
    )}:${current.updated_at}`;

    if (lastAppliedRef.current === key) return;
    lastAppliedRef.current = key;

    suppressEventRef.current = true;

    try {
      const currentVideoId = player.getVideoData?.()?.video_id;
      const currentTime = Number(player.getCurrentTime?.() ?? 0);
      const targetTime = Number(current.playhead_seconds ?? 0);

      if (currentVideoId !== current.video_id) {
        player.loadVideoById(current.video_id, targetTime);
      } else if (Math.abs(currentTime - targetTime) > 2) {
        player.seekTo(targetTime, true);
      }

      if (current.status === "playing") {
        player.playVideo?.();
      } else {
        player.pauseVideo?.();
      }
    } catch (e) {
      console.warn("[youtube] apply state failed", e);
    }

    window.setTimeout(() => {
      suppressEventRef.current = false;
    }, 500);
  }, [state]);

  async function openUrl() {
    const url = input.trim();
    const videoId = extractYouTubeId(url);

    if (!videoId) {
      setError("YouTubeのURLを認識できません");
      return;
    }

    setError("");

    await syncState({
      url,
      video_id: videoId,
      status: "paused",
      playhead_seconds: 0,
    });
  }

  async function sendManualSync() {
    const player = playerRef.current;
    const current = state;

    if (!player || !current?.video_id) return;

    await syncState({
      status: "playing",
      playhead_seconds: Number(player.getCurrentTime?.() ?? 0),
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