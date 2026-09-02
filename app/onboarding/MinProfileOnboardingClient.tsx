"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getDeviceId } from "@/lib/device";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import {
  MinProfileOnboardingForm,
  type MinProfileFormValues,
} from "@/components/onboarding/MinProfileOnboardingForm";
import { trackFunnelEvent } from "@/lib/funnelEvents";
import { sanitizeReturnTo } from "@/lib/profileNavigation";
import { withDev } from "@/lib/withDev";

export function MinProfileOnboardingClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(
    () =>
      sanitizeReturnTo(
        searchParams.get("next") ?? searchParams.get("returnTo") ?? "/"
      ),
    [searchParams]
  );
  const [deviceId, setDeviceId] = useState("");

  useEffect(() => {
    setDeviceId(getDeviceId());
  }, []);

  async function onValidSubmit(values: MinProfileFormValues) {
    if (!deviceId) {
      throw new Error("端末情報の取得に失敗しました。再読み込みしてください。");
    }

    const form = new FormData();
    form.append("mode", "minimum");
    form.append("device_id", deviceId);
    form.append("display_name", values.displayName);
    form.append("declared_age", String(values.declaredAge));
    form.append("terms_agreed", "true");
    form.append("privacy_agreed", "true");
    form.append("guidelines_agreed", "true");

    const res = await authenticatedFetch("/api/profile", {
      method: "POST",
      body: form,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      throw new Error(
        String(json?.message ?? json?.error ?? "保存に失敗しました。")
      );
    }

    void trackFunnelEvent({
      eventName: "min_profile_saved",
      deviceId,
    });

    router.replace(withDev(nextPath));
    router.refresh();
  }

  return (
    <MinProfileOnboardingForm
      onValidSubmit={onValidSubmit}
      submitDisabled={!deviceId}
      submitLabel={
        nextPath && nextPath !== "/"
          ? "保存して通話へ戻る"
          : "ホームへ進む"
      }
      busyLabel="保存中…"
    />
  );
}
