import { BASE_URL } from "./config";

let backendReady: boolean | null = null;

export async function isBackendReady(): Promise<boolean> {
  if (backendReady != null) return backendReady;
  try {
    const res = await fetch(`${BASE_URL}/api/admission/status`, {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    backendReady = res.ok;
  } catch {
    backendReady = false;
  }
  return backendReady;
}

export async function skipWithoutBackend(): Promise<boolean> {
  const ok = await isBackendReady();
  return !ok;
}
