export type RemoteVoiceEpochMember = {
  device_id: string;
  is_in_call?: boolean;
  screen?: string | null;
  joined_at?: string | null;
};

export type RemoteVoiceEpochTrack = {
  epoch: number;
  lastInCall: boolean;
  joinedAt: string;
  lastScreen: string;
  initialized: boolean;
};

export type RemoteVoiceEpochChangeReason =
  | "reentered_call"
  | "joined_at_changed"
  | "screen_entered_call";

export type RemoteVoiceEpochChange = {
  remoteId: string;
  oldEpoch: number;
  newEpoch: number;
  reason: RemoteVoiceEpochChangeReason;
};

export function createEmptyRemoteVoiceEpochTrack(): RemoteVoiceEpochTrack {
  return {
    epoch: 0,
    lastInCall: false,
    joinedAt: "",
    lastScreen: "",
    initialized: false,
  };
}

export function detectRemoteVoiceEpochChanges(
  members: ReadonlyArray<RemoteVoiceEpochMember>,
  viewerDeviceId: string,
  tracks: Map<string, RemoteVoiceEpochTrack>,
  nowMs = Date.now()
): RemoteVoiceEpochChange[] {
  void nowMs;
  const viewerId = String(viewerDeviceId ?? "").trim();
  const changes: RemoteVoiceEpochChange[] = [];
  const seenRemoteIds = new Set<string>();

  for (const member of members) {
    const remoteId = String(member.device_id ?? "").trim();
    if (!remoteId || remoteId === viewerId) continue;

    const inCall = member.is_in_call === true;
    const screen = String(member.screen ?? "").trim();
    const joinedAt = String(member.joined_at ?? "").trim();
    seenRemoteIds.add(remoteId);

    const prev = tracks.get(remoteId) ?? createEmptyRemoteVoiceEpochTrack();
    let nextEpoch = prev.epoch;
    let changeReason: RemoteVoiceEpochChangeReason | null = null;

    if (!prev.initialized && inCall) {
      nextEpoch = 1;
    } else if (prev.initialized && inCall) {
      if (!prev.lastInCall) {
        nextEpoch = prev.epoch + 1;
        changeReason = "reentered_call";
      } else if (joinedAt && prev.joinedAt && joinedAt !== prev.joinedAt) {
        nextEpoch = prev.epoch + 1;
        changeReason = "joined_at_changed";
      } else if (
        screen === "call" &&
        prev.lastScreen !== "call" &&
        prev.epoch >= 1
      ) {
        nextEpoch = prev.epoch + 1;
        changeReason = "screen_entered_call";
      }
    }

    if (changeReason && nextEpoch > prev.epoch && prev.epoch >= 1) {
      changes.push({
        remoteId,
        oldEpoch: prev.epoch,
        newEpoch: nextEpoch,
        reason: changeReason,
      });
    }

    tracks.set(remoteId, {
      epoch: inCall ? Math.max(nextEpoch, prev.initialized ? prev.epoch : 1) : prev.epoch,
      lastInCall: inCall,
      joinedAt: joinedAt || prev.joinedAt,
      lastScreen: screen,
      initialized: prev.initialized || inCall,
    });
  }

  for (const [remoteId, track] of tracks.entries()) {
    if (remoteId === viewerId || seenRemoteIds.has(remoteId)) continue;
    if (track.lastInCall) {
      tracks.set(remoteId, { ...track, lastInCall: false });
    }
  }

  return changes;
}
