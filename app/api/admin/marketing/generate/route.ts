import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getMarketingPublishStatus } from "@/lib/marketing/adapters";
import {
  getMarketingOpenAiApiKey,
  isMarketingCronEnabled,
  isMarketingWeeklyCronEnabled,
} from "@/lib/marketing/config";
import { getActiveStrategy } from "@/lib/marketing/strategy";
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

  const publish = getMarketingPublishStatus();
  const activeStrategy = await getActiveStrategy().catch(() => null);

  return NextResponse.json({
    ok: true,
    openaiConfigured: Boolean(getMarketingOpenAiApiKey()),
    cronEnabled: isMarketingCronEnabled(),
    weeklyCronEnabled: isMarketingWeeklyCronEnabled(),
    buffer: publish.buffer,
    activeAdapter: publish.activeAdapter,
    activeStrategy: activeStrategy
      ? {
          id: activeStrategy.id,
          version: activeStrategy.version,
          label: activeStrategy.label,
        }
      : null,
    note: "POST to generate 3 X draft posts. Without OPENAI_API_KEY, template fallback is used.",
  });
}
