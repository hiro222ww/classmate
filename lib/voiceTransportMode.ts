export type VoiceTransportSettings = {
  p2p_enabled?: boolean | null;
  static_turn_enabled?: boolean | null;
  turn_fallback_enabled?: boolean | null;
};

/** DB/API に行が無いときの P2P 既定（既存運用互換）。 */
export const DEFAULT_P2P_ENABLED = true;

/**
 * 明示 true/false のみ解釈し、それ以外は fallback。
 * 「false を true に戻す」正規化（`!== false` や `|| true`）は使わない。
 */
export function parseExplicitBoolean(
  value: unknown,
  fallback: boolean
): boolean {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return fallback;
}

export function normalizeVoiceTransportSettings(
  raw: VoiceTransportSettings | null | undefined
) {
  const p2pEnabled = parseExplicitBoolean(
    raw?.p2p_enabled,
    DEFAULT_P2P_ENABLED
  );
  const staticTurnEnabled =
    raw?.static_turn_enabled === true || raw?.turn_fallback_enabled === true;

  return {
    p2pEnabled,
    staticTurnEnabled,
    voiceTransportDisabled: !p2pEnabled && !staticTurnEnabled,
    relayForced: !p2pEnabled && staticTurnEnabled,
  };
}

export function describeVoiceTransportMode(
  p2pEnabled: boolean,
  staticTurnEnabled: boolean
) {
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
