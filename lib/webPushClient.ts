/**
 * Client-side Web Push registration.
 * See lib/webPushConstraints.ts for Safari / Chrome limitations.
 */

function urlBase64ToUint8Array(base64String: string) {
  try {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = window.atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) {
      output[i] = raw.charCodeAt(i);
    }
    return output;
  } catch {
    return null;
  }
}

export function isWebPushSupported() {
  if (typeof window === "undefined") return false;
  if (typeof navigator === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function registerClassmateServiceWorker() {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function getVapidPublicKey() {
  const res = await fetch("/api/push/vapid-public-key", { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) return null;
  return String(json.publicKey ?? "").trim() || null;
}

export async function subscribeWebPush(deviceId: string) {
  if (!isWebPushSupported()) {
    return { ok: false as const, error: "unsupported" };
  }

  const normalizedDeviceId = String(deviceId ?? "").trim();
  if (!normalizedDeviceId) {
    return { ok: false as const, error: "device_id_missing" };
  }

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();

  if (permission !== "granted") {
    return { ok: false as const, error: "permission_denied" };
  }

  const publicKey = await getVapidPublicKey();
  if (!publicKey) {
    return { ok: false as const, error: "vapid_not_configured" };
  }

  const registration = await registerClassmateServiceWorker();
  if (!registration) {
    return { ok: false as const, error: "service_worker_failed" };
  }

  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const applicationServerKey = urlBase64ToUint8Array(publicKey);
    if (!applicationServerKey) {
      return { ok: false as const, error: "vapid_not_configured" };
    }

    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false as const, error: "invalid_subscription" };
  }

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      device_id: normalizedDeviceId,
      subscription: json,
      user_agent: navigator.userAgent,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.ok) {
    return {
      ok: false as const,
      error: String(body?.error ?? "subscribe_failed"),
    };
  }

  return { ok: true as const };
}

export async function unsubscribeWebPush(deviceId: string) {
  if (typeof window === "undefined") return { ok: true as const };
  if (!("serviceWorker" in navigator)) {
    return { ok: true as const };
  }

  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();

  if (subscription) {
    const endpoint = subscription.endpoint;
    await fetch("/api/push/unsubscribe", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        device_id: deviceId,
        endpoint,
      }),
    }).catch(() => null);

    await subscription.unsubscribe().catch(() => null);
  }

  return { ok: true as const };
}
