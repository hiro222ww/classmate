/**
 * Canonical app origin for redirects (Stripe, portal return URLs, etc.).
 * Prefer NEXT_PUBLIC_APP_ORIGIN, then NEXT_PUBLIC_APP_URL.
 */
export function resolveAppOrigin(fallback = "http://localhost:3000"): string {
  const origin = String(
    process.env.NEXT_PUBLIC_APP_ORIGIN ?? process.env.NEXT_PUBLIC_APP_URL ?? ""
  ).trim();

  return origin.replace(/\/+$/, "") || fallback;
}
