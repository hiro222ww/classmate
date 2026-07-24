import { NextResponse } from "next/server";
import { buildAppUrl } from "@/lib/appOrigin";
import { disableEmailByUnsubscribeToken } from "@/lib/emailNotificationPrefs";

export const dynamic = "force-dynamic";

function redirectWithStatus(status: "ok" | "already" | "invalid") {
  const url = buildAppUrl(
    `/notifications/email-unsubscribed?status=${encodeURIComponent(status)}`
  );
  return NextResponse.redirect(url, 302);
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const result = await disableEmailByUnsubscribeToken(token);
  if (!result.ok) return redirectWithStatus("invalid");
  if (result.alreadyDisabled) return redirectWithStatus("already");
  return redirectWithStatus("ok");
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = String(body.token ?? "").trim();
  const result = await disableEmailByUnsubscribeToken(token);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    alreadyDisabled: Boolean(result.alreadyDisabled),
  });
}
