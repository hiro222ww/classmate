"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_BILLING_COPY,
  normalizeBillingCopy,
  type BillingCopySettings,
} from "@/lib/billingCopySettings";

export function useBillingCopy() {
  const [copy, setCopy] = useState<BillingCopySettings>(DEFAULT_BILLING_COPY);
  const [slotBillingEnabled, setSlotBillingEnabled] = useState(true);
  const [themeBillingEnabled, setThemeBillingEnabled] = useState(false);
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

        const settings = json?.settings ?? {};
        const hasSlot = typeof settings.slot_billing_enabled === "boolean";
        const hasTheme = typeof settings.theme_billing_enabled === "boolean";
        if (hasSlot || hasTheme) {
          setSlotBillingEnabled(settings.slot_billing_enabled !== false);
          setThemeBillingEnabled(settings.theme_billing_enabled === true);
        } else {
          const legacy = settings.billing_enabled === true;
          setSlotBillingEnabled(legacy);
          setThemeBillingEnabled(legacy);
        }
      } catch {
        if (!cancelled) {
          setCopy(DEFAULT_BILLING_COPY);
          setSlotBillingEnabled(true);
          setThemeBillingEnabled(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const billingEnabled = slotBillingEnabled || themeBillingEnabled;

  return {
    copy,
    billingEnabled,
    slotBillingEnabled,
    themeBillingEnabled,
    loading,
  };
}
