const DEVICE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidDeviceUuid(value: string): boolean {
  return DEVICE_UUID_RE.test(String(value ?? "").trim());
}

export function tailDeviceId(value: string | null | undefined): string {
  const id = String(value ?? "").trim();
  if (!id) return "-";
  return id.length <= 4 ? id : id.slice(-4);
}
