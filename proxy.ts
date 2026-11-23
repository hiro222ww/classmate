import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "classmate_admin";
const MAX_AGE_MS = 1000 * 60 * 60 * 12;

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sign(issuedAt: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(issuedAt)
  );

  return toHex(sig);
}

async function verifyToken(token: string | undefined, secret: string) {
  if (!token) return false;

  const [issuedAt, sig] = token.split(".");
  if (!issuedAt || !sig) return false;

  const issuedMs = Number(issuedAt);
  if (!Number.isFinite(issuedMs)) return false;

  const age = Date.now() - issuedMs;
  if (age < 0 || age > MAX_AGE_MS) return false;

  const expected = await sign(issuedAt, secret);
  return sig === expected;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminPage = pathname.startsWith("/admin");
  const isAdminApi = pathname.startsWith("/api/admin");
  const isCallDemoPage =
    pathname === "/call/demo" || pathname.startsWith("/call/demo/");

  const isLoginPage = pathname === "/admin/login";
  const isLoginApi = pathname === "/api/admin/login";
  const isLogoutApi = pathname === "/api/admin/logout";
  const isSessionApi = pathname === "/api/admin/session";
  const isMarketingCronApi =
    pathname === "/api/admin/marketing/cron" ||
    pathname === "/api/admin/marketing/cron/weekly" ||
    pathname === "/api/admin/marketing/cron/digest";

  if (isLoginPage || isLoginApi || isLogoutApi || isSessionApi) {
    return NextResponse.next();
  }

  // Vercel Cron sends Bearer CRON_SECRET; operators may use MARKETING_CRON_SECRET.
  // Accept either when both are set (preferring only one breaks the other).
  // Route still enforces MARKETING_CRON_* gates + secret.
  if (isMarketingCronApi) {
    const secrets = [
      process.env.MARKETING_CRON_SECRET,
      process.env.CRON_SECRET,
    ]
      .map((s) => String(s ?? "").trim())
      .filter(Boolean);
    const unique = [...new Set(secrets)];
    const auth = req.headers.get("authorization") || "";
    const provided =
      auth.replace(/^Bearer\s+/i, "").trim() ||
      req.nextUrl.searchParams.get("secret") ||
      "";
    if (unique.length && provided && unique.includes(provided)) {
      return NextResponse.next();
    }
  }

  if (!isAdminPage && !isAdminApi && !isCallDemoPage) {
    return NextResponse.next();
  }

  const secret = (process.env.ADMIN_PASSWORD || "").trim();

  if (!secret) {
    if (isAdminApi) {
      return NextResponse.json(
        { ok: false, error: "ADMIN_PASSWORD is not set" },
        { status: 500 }
      );
    }

    return new NextResponse("ADMIN_PASSWORD is not set", { status: 500 });
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const ok = await verifyToken(token, secret);

  if (ok) {
    return NextResponse.next();
  }

  if (isAdminApi) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  // Preserve query (e.g. /admin/marketing?post=<id>) through login.
  const nextTarget = `${pathname}${req.nextUrl.search || ""}`;
  url.search = "";
  url.searchParams.set("next", nextTarget);

  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/call/demo", "/call/demo/:path*"],
};