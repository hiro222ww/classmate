import { NextResponse } from "next/server";
import { resolveRequestIdentity } from "@/lib/requestIdentity";
import { submitUserFeedback } from "@/lib/feedback/service";
import type { FeedbackCategory } from "@/lib/feedback/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public submit endpoint for in-app product feedback.
 * Stores raw text for admins; AI/aggregates use redacted text only.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const deviceId = String(body.deviceId ?? "").trim();
    const category = String(body.category ?? "other").trim() as FeedbackCategory;
    const text = String(body.body ?? body.detail ?? "").trim();
    const pageContext = String(body.pageContext ?? "").trim() || null;

    if (!deviceId) {
      return NextResponse.json(
        { ok: false, error: "deviceId is required" },
        { status: 400 }
      );
    }

    const identity = await resolveRequestIdentity({ req, deviceId });
    const userId =
      identity.ok && identity.identity.userId
        ? identity.identity.userId
        : null;

    const result = await submitUserFeedback({
      deviceId,
      userId,
      category,
      body: text,
      pageContext,
    });

    if (!result.ok) {
      const status =
        result.error === "rate_limited"
          ? 429
          : result.error === "body_too_short" ||
              result.error === "body_too_long" ||
              result.error === "invalid_category"
            ? 400
            : 500;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json({
      ok: true,
      feedbackId: result.feedbackId,
      safetyFlag: result.safetyFlag,
      message: result.safetyFlag
        ? "受け付けました。安全に関する内容は運営が優先確認します。"
        : "フィードバックを受け付けました。ありがとうございます。",
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "feedback_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
