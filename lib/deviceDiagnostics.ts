import { getOrCreateDeviceId, DEVICE_ID_KEY } from "@/lib/device";

const DEVICE_ID_PREVIOUS_KEY = "classmate_device_id_previous";

export function logDeviceIdInit(deviceId: string, context: string) {
  if (typeof window === "undefined") return;

  let source = "provided";
  try {
    const fromStorage = localStorage.getItem(DEVICE_ID_KEY);
    if (!fromStorage?.trim()) {
      source = "new";
    } else if (String(fromStorage).trim() === String(deviceId).trim()) {
      source = "localStorage";
    } else {
      source = "dev_or_override";
    }
  } catch {
    source = "unknown";
  }

  const created = getOrCreateDeviceId();
  const ready = Boolean(String(deviceId ?? "").trim());

  console.log(
    `[device] init context=${context} source=${source} device-ready=${ready} ` +
      `device=${ready ? String(deviceId).slice(-4) : "-"} storage=${created ? created.slice(-4) : "-"}`
  );
}

export function logDeviceIdStability(deviceId: string, context: string) {
  if (typeof window === "undefined") return;

  const current = String(deviceId ?? "").trim();
  let previous = "";

  try {
    previous = String(sessionStorage.getItem(DEVICE_ID_PREVIOUS_KEY) ?? "").trim();
  } catch {
    previous = "";
  }

  const changed = Boolean(previous && current && previous !== current);

  console.log(
    `[device] changed=${changed} context=${context} ` +
      `current=${current ? current.slice(-4) : "-"} previous=${previous ? previous.slice(-4) : "-"}`
  );

  if (current) {
    try {
      sessionStorage.setItem(DEVICE_ID_PREVIOUS_KEY, current);
    } catch {
      // ignore
    }
  }
}
