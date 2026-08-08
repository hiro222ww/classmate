import { NextResponse } from "next/server";
import { verifyAdminToken, ADMIN_COOKIE_NAME } from "@/lib/adminAuth";
import {
  DEFAULT_OPS_TEST_FLAGS,
  resolveOpsTestFlags,
} from "@/lib/opsTestMode";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";
  const token = cookieHeader
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${ADMIN_COOKIE_NAME}=`))
    ?.split("=")[1];

  const authenticated = verifyAdminToken(token);

  return NextResponse.json({
    ok: true,
    authenticated,
    opsTest: authenticated
      ? resolveOpsTestFlags(req)
      : { ...DEFAULT_OPS_TEST_FLAGS },
  });
}
