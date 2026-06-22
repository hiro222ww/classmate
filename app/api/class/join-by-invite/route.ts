import { NextResponse } from "next/server";
import { executeJoinByInvite } from "@/lib/joinByInvite";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { result, httpStatus } = await executeJoinByInvite({ req, body });
    return NextResponse.json(result, { status: httpStatus });
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(`[invite-join] failed step=server error=${detail}`);
    return NextResponse.json(
      {
        ok: false,
        code: "server_error",
        message: "参加処理中にエラーが発生しました。しばらくしてからもう一度お試しください。",
        requestId: "unknown",
        detail,
      },
      { status: 500 }
    );
  }
}
