import { createHash, randomBytes } from "crypto";

export const DEVICE_SECRET_KEY = "classmate_device_secret";
export const DEVICE_SECRET_HEADER = "x-device-secret";

export function createDeviceSecret(): string {
  return randomBytes(32).toString("hex");
}

export function hashDeviceSecret(secret: string): string {
  return createHash("sha256").update(String(secret).trim()).digest("hex");
}

export function isValidDeviceSecret(secret: unknown): boolean {
  const normalized = String(secret ?? "").trim();
  return /^[0-9a-f]{32,128}$/i.test(normalized);
}

export function pickDeviceSecretFromRequest(
  req: Request,
  bodySecret?: unknown
): string {
  const fromHeader = String(req.headers.get(DEVICE_SECRET_HEADER) ?? "").trim();
  if (fromHeader) return fromHeader;
  return String(bodySecret ?? "").trim();
}
