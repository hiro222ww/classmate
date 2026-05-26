import { matchJoinV2Post } from "@/lib/matchJoinV2";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return matchJoinV2Post(req);
}
