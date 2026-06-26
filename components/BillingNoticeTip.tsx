"use client";

import { useEffect, useState } from "react";
import { HelpTip } from "@/components/HelpTip";
import {
  DEFAULT_BILLING_NOTICE_TEXT,
  normalizeBillingNotice,
  type BillingNoticeSetting,
} from "@/lib/billingNoticeDefaults";

type BillingNoticeTipProps = {
  label?: string;
  children?: React.ReactNode;
  maxWidth?: number;
};

export function BillingNoticeTip({
  label = "ご利用について",
  children,
  maxWidth = 320,
}: BillingNoticeTipProps) {
  const [notice, setNotice] = useState<BillingNoticeSetting | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (cancelled) return;

        const raw =
          json?.settings?.billing_notice ?? json?.billing_notice ?? null;
        setNotice(normalizeBillingNotice(raw));
      } catch {
        if (!cancelled) {
          setNotice({
            enabled: true,
            text: DEFAULT_BILLING_NOTICE_TEXT,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!notice?.enabled || !notice.text.trim()) return null;

  return (
    <HelpTip label={label} content={notice.text} maxWidth={maxWidth}>
      {children ?? null}
    </HelpTip>
  );
}
