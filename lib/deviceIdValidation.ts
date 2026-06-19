const DEVICE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Dev / WebRTC E2E device ids (not UUID, but allowed for join APIs). */
const DEV_TEST_DEVICE_RE = /^test-device-\d+$/i;
const WEBRTC_TEST_DEVICE_RE = /^webrtc-test-device-\d+$/i;

export function isValidDeviceUuid(value: string): boolean {
  return DEVICE_UUID_RE.test(String(value ?? "").trim());
}

/** Join APIs accept UUID or dev E2E device ids. */
export function isJoinAllowedDeviceId(value: string): boolean {
  const v = String(value ?? "").trim();
  if (!v) return false;
  if (isValidDeviceUuid(v)) return true;
  if (DEV_TEST_DEVICE_RE.test(v)) return true;
  if (WEBRTC_TEST_DEVICE_RE.test(v)) return true;
  return false;
}

/** Legacy localStorage ids that should be replaced (non-UUID, non-dev). */
export function isLegacyStoredDeviceId(value: string): boolean {
  const v = String(value ?? "").trim();
  if (!v) return false;
  if (isJoinAllowedDeviceId(v)) return false;
  return !isValidDeviceUuid(v);
}

export function tailDeviceId(value: string | null | undefined): string {
  const id = String(value ?? "").trim();
  if (!id) return "-";
  return id.length <= 4 ? id : id.slice(-4);
}
