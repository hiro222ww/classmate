import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getMarketingOpenAiApiKey } from "@/lib/marketing/config";
import { generateMarketingPosts } from "@/lib/marketing/generatePosts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const allowTemplateFallback =
      body.allowTemplateFallback === true || !getMarketingOpenAiApiKey();

    const result = await generateMarketingPosts({
      trigger: "manual_generate",
      allowTemplateFallback,
    });

    if (!result.ok) {
      const status =
        result.error === "daily_run_limit_reached" ||
        result.error === "daily_budget_reached"
          ? 429
          : 500;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "generate_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  return NextResponse.json({
    ok: true,
    openaiConfigured: Boolean(getMarketingOpenAiApiKey()),
    note: "POST to generate 3 X draft posts. Without OPENAI_API_KEY, template fallback is used.",
  });
}
