/**
 * Whether the call chrome should show a prolonged "再接続中" state.
 * Solo (no call-active remotes) is never reconnecting — that is 待機中.
 */
export function resolveVoiceSelfReconnecting(params: {
  voiceLayerActive: boolean;
  voiceJoinFatalError: boolean;
  callActiveRemoteIds: string[];
  peerStates: Record<string, string | undefined>;
  peerDiagnostics: Record<
    string,
    | {
        autoHardResetInProgress?: boolean;
        voicePeerRepairInProgress?: boolean;
      }
    | undefined
  >;
}): boolean {
  if (!params.voiceLayerActive || params.voiceJoinFatalError) return false;
  if (params.callActiveRemoteIds.length === 0) return false;

  const remoteIdSet = new Set(params.callActiveRemoteIds);
  const remoteStates = params.callActiveRemoteIds
    .map((id) => params.peerStates[id])
    .filter(Boolean) as string[];
  const anyConnected = remoteStates.some((state) => state === "connected");
  const peerReconnecting = params.callActiveRemoteIds.some((id) => {
    const diag = params.peerDiagnostics[id];
    return (
      diag?.autoHardResetInProgress === true ||
      diag?.voicePeerRepairInProgress === true
    );
  });
  if (peerReconnecting && !anyConnected) return true;

  const peerConnecting = Object.entries(params.peerStates).some(
    ([id, state]) => remoteIdSet.has(id) && state === "connecting"
  );
  if (anyConnected) return false;
  return peerConnecting;
}
