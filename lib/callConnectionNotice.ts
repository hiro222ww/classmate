/** Delay before showing prolonged reconnect on the hero chip (brief blips stay silent). */
export const CALL_RECONNECT_NOTICE_DELAY_MS = 3500;

export type CallHeroConnectionState = {
  statusLabel: string;
  statusTone: "waiting" | "incall" | "neutral" | "reconnect" | "error";
  /** When true, the hero chip should accept a tap to retry reconnect. */
  statusActionable: boolean;
};

/**
 * Hero chip for call chrome. Prolonged reconnect / fatal override "通話中".
 * Short reconnect stays on 通話中 so the chip doesn't flicker.
 * Large banners are not used — connection state lives only in this chip.
 */
export function resolveCallHeroConnectionState(params: {
  voiceJoinFatalError?: boolean;
  showProlongedReconnectNotice?: boolean;
  membersLocked?: boolean;
}): CallHeroConnectionState {
  if (params.voiceJoinFatalError) {
    return {
      statusLabel: "接続できません",
      statusTone: "error",
      statusActionable: true,
    };
  }
  if (params.showProlongedReconnectNotice) {
    return {
      statusLabel: "再接続中",
      statusTone: "reconnect",
      statusActionable: true,
    };
  }
  if (params.membersLocked === false) {
    return {
      statusLabel: "募集中",
      statusTone: "waiting",
      statusActionable: false,
    };
  }
  return {
    statusLabel: "通話中",
    statusTone: "incall",
    statusActionable: false,
  };
}
