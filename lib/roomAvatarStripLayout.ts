export type RoomAvatarDensity = "lg" | "md" | "sm" | "xs";

export type RoomAvatarStripLayout = {
  density: RoomAvatarDensity;
  /** Rendered circular avatar diameter in px. */
  avatarPx: number;
  /** How many real members to show as chips. */
  visibleCount: number;
  /** Hidden members behind the +N control (0 when none). */
  overflowCount: number;
  /** Whether the +N overflow chip should render. */
  showOverflow: boolean;
};

export type RoomAvatarStripLayoutInput = {
  memberCount: number;
  /**
   * Soft cap for chips before collapsing into +N.
   * Defaults scale with approximate viewport width when provided.
   */
  maxVisible?: number;
  /** Approximate content width in CSS px (hero inner). */
  contentWidthPx?: number;
};

const DENSITY_PX: Record<RoomAvatarDensity, number> = {
  lg: 68,
  md: 56,
  sm: 48,
  xs: 44,
};

/** Prefer showing this many faces before using +N (future 6+ calls). */
export function resolveMaxVisibleAvatars(contentWidthPx?: number): number {
  const w = Number(contentWidthPx);
  if (Number.isFinite(w) && w > 0) {
    if (w < 360) return 5;
    if (w < 720) return 6;
    return 7;
  }
  return 6;
}

function densityForVisibleCount(visibleCount: number): RoomAvatarDensity {
  if (visibleCount <= 2) return "lg";
  if (visibleCount <= 4) return "md";
  if (visibleCount <= 6) return "sm";
  return "xs";
}

/**
 * Size + overflow rules for the room/call hero avatar strip.
 * Empty seats are never part of the layout — only real members.
 */
export function resolveRoomAvatarStripLayout(
  input: RoomAvatarStripLayoutInput
): RoomAvatarStripLayout {
  const memberCount = Math.max(0, Math.floor(Number(input.memberCount) || 0));
  const maxVisible = Math.max(
    1,
    Math.floor(
      Number.isFinite(Number(input.maxVisible))
        ? Number(input.maxVisible)
        : resolveMaxVisibleAvatars(input.contentWidthPx)
    )
  );

  if (memberCount === 0) {
    return {
      density: "lg",
      avatarPx: DENSITY_PX.lg,
      visibleCount: 0,
      overflowCount: 0,
      showOverflow: false,
    };
  }

  // Collapse once we would exceed the soft visible cap (guide: ~7+).
  const needsOverflow = memberCount > maxVisible;
  const visibleCount = needsOverflow
    ? Math.max(1, maxVisible - 1)
    : memberCount;
  const overflowCount = needsOverflow
    ? Math.max(0, memberCount - visibleCount)
    : 0;

  // Size from the on-screen chip count (members + optional +N).
  const chipCount = visibleCount + (overflowCount > 0 ? 1 : 0);
  const density = densityForVisibleCount(chipCount);

  return {
    density,
    avatarPx: DENSITY_PX[density],
    visibleCount,
    overflowCount,
    showOverflow: overflowCount > 0,
  };
}
