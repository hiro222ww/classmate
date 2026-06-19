export const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

export const DEBUG_QUERY = "debugLogs=1";

export function withDev(path: string, devKey = "1"): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}dev=${devKey}&${DEBUG_QUERY}`;
}

export function withDebug(path: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${DEBUG_QUERY}`;
}
