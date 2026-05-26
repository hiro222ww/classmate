import { matchJoinV2Post } from "@/lib/matchJoinV2";

export const dynamic = "force-dynamic";

/** Pre-checks in matchJoinV2Post; atomic join via match_join_atomic_v3 RPC. */
export async function POST(req: Request) {
  return matchJoinV2Post(req);
}
