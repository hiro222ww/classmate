import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type YouTubeSearchItem = {
  id?: {
    videoId?: string;
  };
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: {
      medium?: {
        url?: string;
      };
      default?: {
        url?: string;
      };
    };
  };
};

export async function GET(req: Request) {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "YOUTUBE_API_KEY is missing" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  if (!q) {
    return NextResponse.json({ ok: true, items: [] });
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", "8");
  url.searchParams.set("q", q);
  url.searchParams.set("safeSearch", "moderate");
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString(), {
    cache: "no-store",
  });

  const json = await res.json();

  if (!res.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: json?.error?.message ?? "youtube_search_failed",
      },
      { status: res.status }
    );
  }

  const items = ((json.items ?? []) as YouTubeSearchItem[])
    .map((item) => ({
      videoId: item.id?.videoId ?? "",
      title: item.snippet?.title ?? "Untitled",
      channelTitle: item.snippet?.channelTitle ?? "",
      thumbnail:
        item.snippet?.thumbnails?.medium?.url ??
        item.snippet?.thumbnails?.default?.url ??
        "",
    }))
    .filter((item) => item.videoId);

  return NextResponse.json({ ok: true, items });
}