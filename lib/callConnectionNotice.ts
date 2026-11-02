/** Delay before showing a reconnect toast so brief blips don't shift layout. */
export const CALL_RECONNECT_NOTICE_DELAY_MS = 3500;

export type CallHeroConnectionState = {
  statusLabel: string;
  statusTone: "waiting" | "incall" | "neutral" | "reconnect" | "error";
};

/**
 * Hero chip for call chrome. Prolonged reconnect / fatal override "通話中".
 * Short reconnect stays on 通話中 so the chip doesn't flicker.
 */
export function resolveCallHeroConnectionState(params: {
  voiceJoinFatalError?: boolean;
  showProlongedReconnectNotice?: boolean;
  membersLocked?: boolean;
}): CallHeroConnectionState {
  if (params.voiceJoinFatalError) {
    return { statusLabel: "接続エラー", statusTone: "error" };
  }
  if (params.showProlongedReconnectNotice) {
    return { statusLabel: "再接続中", statusTone: "reconnect" };
  }
  if (params.membersLocked === false) {
    return { statusLabel: "募集中", statusTone: "waiting" };
  }
  return { statusLabel: "通話中", statusTone: "incall" };
}
