"use client";

/**
 * Alone-wait timeout UI was removed: users keep the hero「募集中」chip and
 * leave via the red 退出 control. Kept as a no-op export so older call sites
 * continue to compile without reintroducing the confirm card.
 */
type Props = {
  memberCount: number;
  elapsedLabel: string;
  showTimeoutChoice: boolean;
  alreadyExtended: boolean;
  extendBusy: boolean;
  quitBusy: boolean;
  extendError: string | null;
  onExtend: () => void;
  onQuit: () => void;
};

export function LobbyWaitingPanel(_props: Props) {
  return null;
}
