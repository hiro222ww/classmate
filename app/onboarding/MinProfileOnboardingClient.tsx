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
import { isRetryableNetworkError } from "@/lib/retryableFetch";
import {
  PROFILE_SAVE_NETWORK_USER_MESSAGE,
  PROFILE_SAVE_SERVER_UNAVAILABLE_MESSAGE,
  toUserFacingProfileSaveError,
} from "@/lib/supabaseRetry";

async function sleep(ms: number) {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function buildMinimumProfileForm(
  deviceId: string,
  values: MinProfileFormValues
) {
  const form = new FormData();
  form.append("mode", "minimum");
  form.append("device_id", deviceId);
  form.append("display_name", values.displayName);
  form.append("declared_age", String(values.declaredAge));
  form.append("terms_agreed", "true");
  form.append("privacy_agreed", "true");
  form.append("guidelines_agreed", "true");
  return form;
}

async function postMinimumProfileWithRetry(
  deviceId: string,
  values: MinProfileFormValues
) {
  const maxAttempts = 3;
  const backoffMs = [300, 800];
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      // Rebuild FormData each attempt — request bodies are not reliably reusable.
      const res = await authenticatedFetch("/api/profile", {
        method: "POST",
        body: buildMinimumProfileForm(deviceId, values),
      });
      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        return json;
      }

      const message = String(
        json?.message ?? json?.error ?? "保存に失敗しました。"
      );
      const retryable =
        res.status >= 500 ||
        res.status === 503 ||
        isRetryableNetworkError(message);

      if (retryable && attempt < maxAttempts - 1) {
        lastError = new Error(message);
        await sleep(backoffMs[Math.min(attempt, backoffMs.length - 1)] ?? 800);
        continue;
      }

      if (res.status >= 500 || res.status === 503) {
        throw new Error(
          toUserFacingProfileSaveError(message, { source: "server" })
        );
      }

      throw new Error(toUserFacingProfileSaveError(message, { source: "client" }));
    } catch (error) {
      lastError = error;
      const alreadyUserFacing =
        error instanceof Error &&
        (error.message === PROFILE_SAVE_NETWORK_USER_MESSAGE ||
          error.message === PROFILE_SAVE_SERVER_UNAVAILABLE_MESSAGE);
      const retryable = isRetryableNetworkError(error);
      if (retryable && attempt < maxAttempts - 1) {
        await sleep(backoffMs[Math.min(attempt, backoffMs.length - 1)] ?? 800);
        continue;
      }
      if (alreadyUserFacing) throw error;
      throw new Error(
        toUserFacingProfileSaveError(error, { source: "client" })
      );
    }
  }

  throw new Error(
    toUserFacingProfileSaveError(lastError) || PROFILE_SAVE_NETWORK_USER_MESSAGE
  );
}

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

    await postMinimumProfileWithRetry(deviceId, values);

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
