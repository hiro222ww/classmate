/**
 * Whether the account avatar should show an unread notification dot.
 * Never treat push-notification OFF as unread, and never invent a decorative
 * badge when counts were not reliably loaded.
 */
export function shouldShowAccountUnreadDot(params: {
  unreadCountsReliable: boolean;
  unreadTotal: number;
}): boolean {
  if (!params.unreadCountsReliable) return false;
  return Number(params.unreadTotal) > 0;
}

export function sumClassUnreadCounts(
  rows: Array<{ unread_count?: number | null } | null | undefined>
): number {
  let total = 0;
  for (const row of rows) {
    const n = Number(row?.unread_count);
    if (Number.isFinite(n) && n > 0) total += Math.floor(n);
  }
  return total;
}
