// app/api/user/entitlements/route.ts
import { NextResponse } from "next/server";
import { resolveRequestIdentity } from "@/lib/requestIdentity";
import { lookupEntitlements } from "@/lib/userIdentityMigration";
import { pickDeviceIdFromRequest } from "@/lib/userIdentity";

async function handle(req: Request, bodyDeviceId?: string) {
  const deviceId = pickDeviceIdFromRequest(req, bodyDeviceId);

  if (!deviceId) {
    return NextResponse.json({ error: "device_id_missing" }, { status: 400 });
  }

  const resolved = await resolveRequestIdentity({ req, deviceId });
  const userId = resolved.ok ? resolved.identity.userId : "";

  try {
    const data = await lookupEntitlements({ userId, deviceId });

    if (!data) {
      return NextResponse.json({
        device_id: deviceId,
        user_id: userId || null,
        plan: "free",
        class_slots: 1,
        can_create_classes: false,
        topic_plan: 0,
        theme_pass: false,
        updated_at: new Date(0).toISOString(),
      });
    }

    return NextResponse.json({
      ...data,
      user_id: data.user_id ?? userId ?? null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "db_error", detail: error?.message ?? "lookup_failed" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return handle(req, body?.deviceId);
}
