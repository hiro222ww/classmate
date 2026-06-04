export type VoiceTransportSettings = {
  p2p_enabled?: boolean | null;
  static_turn_enabled?: boolean | null;
  turn_fallback_enabled?: boolean | null;
};

export function normalizeVoiceTransportSettings(
  raw: VoiceTransportSettings | null | undefined
) {
  const p2pEnabled = raw?.p2p_enabled !== false;
  const staticTurnEnabled =
    raw?.static_turn_enabled === true || raw?.turn_fallback_enabled === true;

  return {
    p2pEnabled,
    staticTurnEnabled,
    voiceTransportDisabled: !p2pEnabled && !staticTurnEnabled,
    relayForced: !p2pEnabled && staticTurnEnabled,
  };
}

export function describeVoiceTransportMode(p2pEnabled: boolean, staticTurnEnabled: boolean) {
  if (!p2pEnabled && !staticTurnEnabled) {
    return "disabled";
  }
  if (!p2pEnabled && staticTurnEnabled) {
    return "relay_only";
  }
  if (p2pEnabled && staticTurnEnabled) {
    return "p2p_with_static_fallback";
  }
  return "p2p_only";
}
