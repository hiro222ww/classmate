import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Vercelのキャッシュを無効化し、常に最新の情報を返す設定
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. データベースの接続テスト（軽めのクエリ）
  const { error } = await supabase
    .from("topics")
    .select("topic_key")
    .limit(1);

  return NextResponse.json({
    status: "healthy",
    // ⬇️ デプロイのたびにここの文字を変えれば、コードが更新されたか一発で分かります
    version: "v1.0.0 (Apple Test完了版)", 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    vercel_region: process.env.VERCEL_REGION ?? "local",
    database: {
      connected: !error,
      error_message: error ? error.message : null,
    },
  });
}