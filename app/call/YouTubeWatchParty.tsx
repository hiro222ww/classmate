"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Props = {
  sessionId: string;
  deviceId: string;
};

type YoutubeState = {
  session_id: string;
  url: string;
  video_id: string;
  status: "paused";
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
  try {
    const u = new URL(input.trim());

    if (u.hostname.includes("youtu.be")) {
      return u.pathname.replace("/", "");
    }

    if (u.hostname.includes("youtube.com")) {
      return (
        u.searchParams.get("v") ||
        u.pathname.replace("/shorts/", "") ||
        ""
      );
    }

    return "";
  } catch {
    return "";
  }
}

function buildEmbedUrl(videoId: string, start: number) {
  return `https://www.youtube.com/embed/${videoId}?start=${Math.floor(
    start
  )}&autoplay=0&playsinline=1&rel=0&modestbranding=1`;
}

export default function YouTubeWatchParty({ sessionId, deviceId }: Props) {
  const channelRef = useRef<any>(null);
  const stateRef = useRef<YoutubeState | null>(null);
  const lastAppliedRef = useRef("");

  const [input, setInput] = useState("");
  const [state, setState] = useState<YoutubeState | null>(null);
  const [error, setError] = useState("");
  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const bumpIframe = () => setIframeKey((v) => v + 1);

  const saveStateToDb = async (patch: Partial<YoutubeState>) => {
    const current = stateRef.current;

    const next: YoutubeState = {
      session_id: sessionId,
      url: patch.url ?? current?.url ?? "",
      video_id: patch.video_id ?? current?.video_id ?? "",
      status: "paused",
      playhead_seconds:
        patch.playhead_seconds ?? current?.playhead_seconds ?? 0,
      updated_by: deviceId,
      updated_at: new Date().toISOString(),
    };

    stateRef.current = next;
    setState(next);

    await supabase
      .from("session_youtube_state")
      .upsert(next, { onConflict: "session_id" });
  };

  const send = async (
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
  };

  const applyRemote = useCallback((p: YoutubeBroadcastPayload) => {
    if (p.fromDeviceId === deviceId) return;

    const key = `${p.fromDeviceId}:${p.sentAt}`;
    if (lastAppliedRef.current === key) return;
    lastAppliedRef.current = key;

    const next: YoutubeState = {
      session_id: sessionId,
      url: stateRef.current?.url ?? "",
      video_id: p.videoId,
      status: "paused",
      playhead_seconds: p.playheadSeconds,
      updated_by: p.fromDeviceId,
      updated_at: new Date().toISOString(),
    };

    stateRef.current = next;
    setState(next);

    // 👇 ここが重要
    if (p.kind === "video_change") {
      bumpIframe();
    }
  }, [deviceId, sessionId]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("session_youtube_state")
        .select("*")
        .eq("session_id", sessionId)
        .maybeSingle();

      if (data) {
        stateRef.current = data;
        setState(data);
        bumpIframe();
      }
    }

    load();

    const ch = supabase
      .channel(`yt-${sessionId}`)
      .on("broadcast", { event: "youtube-sync" }, ({ payload }) =>
        applyRemote(payload)
      )
      .subscribe();

    channelRef.current = ch;

    return () => {
      supabase.removeChannel(ch);
    };
  }, [sessionId, applyRemote]);

  async function openUrl() {
    const id = extractYouTubeId(input);
    if (!id) {
      setError("URLだめ");
      return;
    }

    setError("");

    await saveStateToDb({
      url: input,
      video_id: id,
      playhead_seconds: 0,
    });

    bumpIframe();

    await send({
      kind: "video_change",
      videoId: id,
      playheadSeconds: 0,
    });
  }

  async function sync(sec: number) {
    const cur = stateRef.current;
    if (!cur?.video_id) return;

    await saveStateToDb({
      video_id: cur.video_id,
      playhead_seconds: sec,
    });

    // ❌ iframeはリロードしない（重要）

    await send({
      kind: "sync_time",
      videoId: cur.video_id,
      playheadSeconds: sec,
    });
  }

  const src = state?.video_id
    ? buildEmbedUrl(state.video_id, state.playhead_seconds)
    : "";

  return (
    <section>
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={openUrl}>共有</button>

      {state?.video_id && (
        <>
          <iframe
            key={iframeKey}
            src={src}
            style={{ width: "100%", height: 300 }}
          />

          <button onClick={() => sync(state.playhead_seconds)}>
            同期
          </button>
        </>
      )}
    </section>
  );
}