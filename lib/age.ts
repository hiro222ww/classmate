export function getAge(birthDate: string, now = new Date()) {
  const match = String(birthDate ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      !Number.isFinite(day) ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31
    ) {
      return null;
    }

    let age = now.getFullYear() - year;
    const monthDiff = now.getMonth() + 1 - month;
    const dayDiff = now.getDate() - day;

    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
      age -= 1;
    }

    return age;
  }

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
