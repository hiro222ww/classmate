import { NextResponse } from "next/server";
import { POST as classLeavePost } from "@/app/api/class/leave/route";

/** @deprecated Use POST /api/class/leave for full cleanup. */
export async function POST(req: Request) {
  return classLeavePost(req);
}
