import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { promises as dns } from "node:dns";

// Vercelのキャッシュを無効化し、常に最新の情報を返す設定
export const dynamic = "force-dynamic";

function supabaseHostname() {
  const raw =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  try {
    return new URL(raw).hostname;
  } catch {
    return "";
  }
}

export async function GET() {
  const hostname = supabaseHostname();
  let dnsOk: boolean | null = null;
  let dnsError: string | null = null;

  if (hostname) {
    try {
      await dns.lookup(hostname);
      dnsOk = true;
    } catch (error) {
      dnsOk = false;
      dnsError =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error ?? "dns_lookup_failed");
    }
  } else {
    dnsOk = false;
    dnsError = "missing_supabase_url";
  }

  let dbConnected = false;
  let dbError: string | null = null;

  if (dnsOk) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase.from("topics").select("topic_key").limit(1);
    dbConnected = !error;
    dbError = error ? error.message : null;
  } else {
    dbError = dnsError;
  }

  return NextResponse.json({
    status: dbConnected ? "healthy" : "degraded",
    version: "v1.0.1 (supabase-dns-diag)",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    vercel_region: process.env.VERCEL_REGION ?? "local",
    supabase_host_tail: hostname ? hostname.slice(-24) : null,
    dns: {
      ok: dnsOk,
      error_message: dnsError,
    },
    database: {
      connected: dbConnected,
      error_message: dbError,
    },
  });
}
