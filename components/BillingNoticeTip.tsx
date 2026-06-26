"use client";

import { HelpTip } from "@/components/HelpTip";
import { useBillingCopy } from "@/hooks/useBillingCopy";

type BillingNoticeTipProps = {
  label?: string;
  children?: React.ReactNode;
  maxWidth?: number;
};

export function BillingNoticeTip({
  label,
  children,
  maxWidth = 320,
}: BillingNoticeTipProps) {
  const { copy, loading } = useBillingCopy();
  const notice = copy.notice;

  if (loading) return null;
  if (!notice.enabled || !notice.text.trim()) return null;

  return (
    <HelpTip
      label={label ?? notice.label}
      content={notice.text}
      maxWidth={maxWidth}
    >
      {children ?? null}
    </HelpTip>
  );
}
