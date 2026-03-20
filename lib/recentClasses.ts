// lib/recentClasses.ts

export type RecentClass = {
  id: string;      // class_id があればそれ、無ければ sessionId
  title: string;   // 表示名
  url: string;     // ここへ戻る（/room?sessionId=... 等）
  updatedAt: number;
};

// HomeClient が読んでいるキーに合わせる（超重要）
const KEY = "classmate_recent_classes";

// 旧実装があり得るので読み取りだけ互換（見つけたら移行）
const LEGACY_KEYS = [
  "classmate_recent_classes_v1",
  "recent_classes",
  "recentClasses",
];

function safeParse<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function normalize(list: any): RecentClass[] {
  if (!Array.isArray(list)) return [];
  const out: RecentClass[] = [];
  for (const x of list) {
    if (!x) continue;

    const id = String(x.id ?? x.sessionId ?? x.session_id ?? "").trim();
    const url = String(x.url ?? "").trim();
    const title = String(x.title ?? "クラス").trim();
    const updatedAt = Number(x.updatedAt ?? x.updated_at ?? Date.now());

    if (!id || !url) continue;
    out.push({ id, url, title, updatedAt });
  }

  // updatedAt desc
  out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  // uniq id（先頭優先）
  const seen = new Set<string>();
  return out.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}

export function readRecent(): RecentClass[] {
  if (typeof window === "undefined") return [];

  const cur = normalize(safeParse<any>(localStorage.getItem(KEY), []));
  if (cur.length) return cur;

  for (const k of LEGACY_KEYS) {
    const legacy = normalize(safeParse<any>(localStorage.getItem(k), []));
    if (legacy.length) {
      // 移行しておく
      try {
        localStorage.setItem(KEY, JSON.stringify(legacy));
      } catch {}
      return legacy;
    }
  }

  return [];
}

export function pushRecentClass(item: Omit<RecentClass, "updatedAt">, limit: number) {
  if (typeof window === "undefined") return;

  const now = Date.now();
  const list = readRecent();

  const next = [{ ...item, updatedAt: now }, ...list.filter((x) => x.id !== item.id)].slice(0, Math.max(1, limit));

  localStorage.setItem(KEY, JSON.stringify(next));
}

export function removeRecentClass(id: string) {
  if (typeof window === "undefined") return;
  const next = readRecent().filter((x) => x.id !== id);
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function clearRecentClasses() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
  for (const k of LEGACY_KEYS) localStorage.removeItem(k);
}
