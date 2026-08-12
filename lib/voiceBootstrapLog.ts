/** Production-only bootstrap diagnostics helpers (no voice behavior). */

export type VoiceBootstrapMemberRow = {
  device_id?: string | null;
  is_in_call?: boolean | null;
  screen?: string | null;
};

export function describeVoiceBootstrapSkipReason(params: {
  deviceId: string;
  selfDeviceId: string;
  isInCall: boolean;
  screen: string;
  inRemoteIds: boolean;
  localExited: boolean;
  explicitRemoved: boolean;
}): string {
  const id = String(params.deviceId ?? "").trim();
  const selfId = String(params.selfDeviceId ?? "").trim();
  if (!id) return "empty_id";
  if (id === selfId) return "self";
  if (params.explicitRemoved) return "explicit_removed";
  if (params.localExited) return "local_exited";
  if (params.inRemoteIds) return "in_remoteIds";
  const screen = String(params.screen ?? "").trim();
  if (screen === "room" || screen === "home" || screen === "offline") {
    return `left_call_screen:${screen || "-"}`;
  }
  if (!params.isInCall) return "not_in_call";
  return "not_in_remoteIds";
}

export function formatVoiceBootstrapMemberSummary(
  members: ReadonlyArray<VoiceBootstrapMemberRow>,
  params: {
    selfDeviceId: string;
    remoteIds: ReadonlyArray<string>;
    localExitedIds?: ReadonlySet<string>;
    explicitRemovedIds?: ReadonlySet<string>;
  }
): string {
  const selfId = String(params.selfDeviceId ?? "").trim();
  const remoteSet = new Set(params.remoteIds);
  const localExited = params.localExitedIds ?? new Set<string>();
  const explicitRemoved = params.explicitRemovedIds ?? new Set<string>();

  return members
    .map((member) => {
      const id = String(member.device_id ?? "").trim();
      if (!id) return null;
      const isInCall = member.is_in_call === true;
      const screen = String(member.screen ?? "").trim() || "-";
      const reason = describeVoiceBootstrapSkipReason({
        deviceId: id,
        selfDeviceId: selfId,
        isInCall,
        screen,
        inRemoteIds: remoteSet.has(id),
        localExited: localExited.has(id),
        explicitRemoved: explicitRemoved.has(id),
      });
      return `${id.slice(-4)}:inCall=${isInCall ? 1 : 0}:screen=${screen}:skip=${reason}`;
    })
    .filter(Boolean)
    .join("|");
}
