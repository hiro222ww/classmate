import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Legacy standalone 絞り込み page — folded into /class/select age sheet.
 * Keep the route so old bookmarks / history.back() land on the current UI.
 */
export default async function ClassFilterRedirectPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const sp = (await Promise.resolve(searchParams)) ?? {};
  const q = new URLSearchParams();
  for (const key of ["minAge", "maxAge", "world", "topic", "cat", "mode", "dev"] as const) {
    const raw = sp[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value) q.set(key, value);
  }
  const qs = q.toString();
  redirect(qs ? `/class/select?${qs}` : "/class/select");
}
