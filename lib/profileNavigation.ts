const ALLOWED_RETURN_PREFIXES = ["/", "/class/select", "/room", "/call"] as const;

export function sanitizeReturnTo(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) return "/";

  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) {
    return "/";
  }

  if (value.includes("..")) {
    return "/";
  }

  let path = value;
  try {
    const url = new URL(value, "http://localhost");
    path = `${url.pathname}${url.search}`;
  } catch {
    return "/";
  }

  const allowed = ALLOWED_RETURN_PREFIXES.some((prefix) => {
    if (prefix === "/") return path === "/";
    return path === prefix || path.startsWith(`${prefix}?`) || path.startsWith(`${prefix}/`);
  });

  return allowed ? path : "/";
}

export function buildProfileEditPath(returnTo: string): string {
  const safe = sanitizeReturnTo(returnTo);
  return `/profile?returnTo=${encodeURIComponent(safe)}`;
}

export function buildCurrentPathReturnTo(pathname: string, search: string): string {
  const path = String(pathname ?? "").trim() || "/";
  const qs = String(search ?? "").trim();
  return sanitizeReturnTo(qs ? `${path}?${qs}` : path);
}
