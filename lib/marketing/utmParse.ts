/** Safe UTM parse/sanitize for first-party attribution (no PII). */

export const UTM_VALUE_MAX_LEN = 80;
export const UTM_SESSION_STORAGE_KEY = "cm_utm_first_v1";

const UTM_SAFE_RE = /^[A-Za-z0-9_.:\-]+$/;

export type UtmParams = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
};

export function sanitizeUtmValue(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const clipped = value.slice(0, UTM_VALUE_MAX_LEN);
  if (!UTM_SAFE_RE.test(clipped)) return null;
  return clipped;
}

export function parseUtmFromSearch(search: string | URLSearchParams): UtmParams {
  const params =
    typeof search === "string"
      ? new URLSearchParams(
          search.startsWith("?") ? search.slice(1) : search
        )
      : search;

  return {
    utm_source: sanitizeUtmValue(params.get("utm_source")),
    utm_medium: sanitizeUtmValue(params.get("utm_medium")),
    utm_campaign: sanitizeUtmValue(params.get("utm_campaign")),
    utm_content: sanitizeUtmValue(params.get("utm_content")),
  };
}

export function hasAnyUtm(utm: UtmParams): boolean {
  return Boolean(
    utm.utm_source || utm.utm_medium || utm.utm_campaign || utm.utm_content
  );
}

/** Prefer incoming URL UTM; otherwise keep previously stored first-touch. */
export function mergeUtmPreference(
  incoming: UtmParams,
  stored: UtmParams | null
): UtmParams {
  if (hasAnyUtm(incoming)) return incoming;
  return (
    stored ?? {
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
    }
  );
}

export function readStoredUtm(): UtmParams | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(UTM_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UtmParams>;
    return {
      utm_source: sanitizeUtmValue(parsed.utm_source),
      utm_medium: sanitizeUtmValue(parsed.utm_medium),
      utm_campaign: sanitizeUtmValue(parsed.utm_campaign),
      utm_content: sanitizeUtmValue(parsed.utm_content),
    };
  } catch {
    return null;
  }
}

export function writeStoredUtm(utm: UtmParams): void {
  if (typeof window === "undefined") return;
  if (!hasAnyUtm(utm)) return;
  try {
    sessionStorage.setItem(UTM_SESSION_STORAGE_KEY, JSON.stringify(utm));
  } catch {
    // ignore quota / private mode
  }
}

/** Capture URL UTM into sessionStorage (first-touch within the tab session). */
export function captureUtmFromLocation(): UtmParams {
  if (typeof window === "undefined") {
    return {
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
    };
  }
  const incoming = parseUtmFromSearch(window.location.search);
  const stored = readStoredUtm();
  const merged = mergeUtmPreference(incoming, stored);
  if (hasAnyUtm(incoming) && !stored) {
    writeStoredUtm(incoming);
  } else if (hasAnyUtm(incoming)) {
    // Refresh first-touch only when empty; keep first within session.
    writeStoredUtm(stored && hasAnyUtm(stored) ? stored : incoming);
  }
  return merged;
}
