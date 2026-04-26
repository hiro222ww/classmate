export function withDev(path: string): string {
  if (typeof window === "undefined") return path;

  const params = new URLSearchParams(window.location.search);
  const dev = params.get("dev");

  if (!dev) return path;

  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}dev=${encodeURIComponent(dev)}`;
}