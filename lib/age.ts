export function getAge(birthDate: string, now = new Date()) {
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;

  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();

  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) {
    age--;
  }

  return age;
}

export function getAgeFromBirthDate(
  birthDate: string | null | undefined,
  now = new Date()
): number | null {
  const s = String(birthDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;

  const age = getAge(s, now);
  if (age == null || !Number.isFinite(age) || age < 0 || age > 150) {
    return null;
  }

  return age;
}
