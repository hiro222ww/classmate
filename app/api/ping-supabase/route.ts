import { NextResponse } from "next/server";
import dns from "node:dns/promises";

export const runtime = "nodejs";

function hostFromUrl(u: string) {
  try {
    return new URL(u).hostname;
  } catch {
    return "";
  }
}

export async function GET() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return NextResponse.json(
      {
        ok: false,
        where: "env",
        error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
        debug: { hasSUPABASE_URL: !!url, hasSERVICE_ROLE_KEY: !!key, SUPABASE_URL_value: url ?? null },
      },
      { status: 500 }
    );
  }

  const host = hostFromUrl(url);

  // 1) DNS解決できるか
  try {
    const addrs = await dns.lookup(host, { all: true });
    // 2) URLにHTTP接続できるか
    try {
      const res = await fetch(url, { method: "GET" });
      return NextResponse.json({
        ok: true,
        where: "fetch-url",
        status: res.status,
        host,
        dns: addrs,
        SUPABASE_URL_value: url,
      });
    } catch (e: any) {
      return NextResponse.json(
        {
          ok: false,
          where: "fetch-url",
          error: `fetch(url) failed: ${String(e?.message ?? e)}`,
          host,
          dns: addrs,
          SUPABASE_URL_value: url,
          hint: "DNSは引けているので、TLS/ネット遮断/プロキシの可能性が高い",
        },
        { status: 500 }
      );
    }
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        where: "dns",
        error: `dns.lookup failed: ${String(e?.message ?? e)}`,
        host,
        SUPABASE_URL_value: url,
        hint: "DNSが引けていません。回線/ルータDNS/VPN/社内ネット制限を疑ってください。",
      },
      { status: 500 }
    );
  }
}
