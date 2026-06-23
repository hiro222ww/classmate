import type { ActiveClassMembershipRow } from "@/lib/activeClassMemberships";

export function pickPrimaryMembershipClassId(
  visibleClassIds: string[],
  rows: ActiveClassMembershipRow[]
): string | null {
  if (visibleClassIds.length === 0) return null;

  const visibleSet = new Set(visibleClassIds);
  const candidates = rows.filter(
    (row) => row.isBillable && visibleSet.has(row.classId)
  );

  if (candidates.length === 0) {
    return visibleClassIds[0] ?? null;
  }

  const sorted = [...candidates].sort((a, b) => {
    const at = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
    const bt = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
    if (bt !== at) return bt - at;
    return a.classId.localeCompare(b.classId);
  });

  return sorted[0]?.classId ?? visibleClassIds[0] ?? null;
}
