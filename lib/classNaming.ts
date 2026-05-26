/** System class display name: クラス0001A .. クラス9999Z */
export const SYSTEM_CLASS_NAME_PATTERN = /^クラス(\d{4})([A-Z])$/;

export function isSystemClassName(name: unknown) {
  return SYSTEM_CLASS_NAME_PATTERN.test(String(name ?? "").trim());
}

export function parseSystemClassName(name: unknown) {
  const match = String(name ?? "")
    .trim()
    .match(SYSTEM_CLASS_NAME_PATTERN);

  if (!match) return null;

  return {
    serial: Number(match[1]),
    suffix: match[2],
    label: match[0],
  };
}
