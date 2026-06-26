"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_BILLING_COPY,
  normalizeBillingCopy,
  type BillingCopySettings,
} from "@/lib/billingCopySettings";

export function useBillingCopy() {
  const [copy, setCopy] = useState<BillingCopySettings>(DEFAULT_BILLING_COPY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (cancelled) return;

        const raw =
          json?.settings?.billing_copy ??
          json?.billing_copy ??
          json?.settings?.billing_notice ??
          null;
        const legacyNotice = json?.settings?.billing_notice ?? null;

        setCopy(normalizeBillingCopy(raw, legacyNotice));
      } catch {
        if (!cancelled) setCopy(DEFAULT_BILLING_COPY);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { copy, loading };
}
