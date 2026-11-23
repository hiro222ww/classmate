import { safeEqualString } from "@/lib/adminAuth";

/**
 * Vercel Cron sends Authorization: Bearer ${CRON_SECRET}.
 * Operators may also set MARKETING_CRON_SECRET for manual POSTs.
 * If both are set to different values, preferring only one breaks the other.
 * Accept either (timing-safe).
 */
export function getMarketingCronSecrets(): string[] {
  const a = String(process.env.MARKETING_CRON_SECRET ?? "").trim();
  const b = String(process.env.CRON_SECRET ?? "").trim();
  const out: string[] = [];
  if (a) out.push(a);
  if (b && b !== a) out.push(b);
  return out;
}

export function matchesMarketingCronSecret(provided: string): boolean {
  const p = String(provided ?? "").trim();
  if (!p) return false;
  for (const secret of getMarketingCronSecrets()) {
    if (safeEqualString(p, secret)) return true;
  }
  return false;
}

export function hasMarketingCronSecretConfigured(): boolean {
  return getMarketingCronSecrets().length > 0;
}
