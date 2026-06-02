import { compactConnectionId, compactDeviceId } from "./voiceDiagnostics";

export type IceCandidateTypeLabel =
  | "host"
  | "srflx"
  | "relay"
  | "prflx"
  | "unknown";

type IceCandidatePayload = RTCIceCandidateInit & {
  type?: string;
  protocol?: string;
  address?: string;
  port?: number | null;
  foundation?: string;
};

export type PeerIceDiagnostics = {
  localTypes: Set<string>;
  localCount: number;
  remoteTypes: Set<string>;
  remoteAddedCount: number;
  remoteQueuedCount: number;
  gatheringState: string;
};

export function createEmptyPeerIceDiagnostics(): PeerIceDiagnostics {
  return {
    localTypes: new Set(),
    localCount: 0,
    remoteTypes: new Set(),
    remoteAddedCount: 0,
    remoteQueuedCount: 0,
    gatheringState: "new",
  };
}

export function formatIceTypeSet(types: Set<string>): string {
  if (!types.size) return "-";
  return Array.from(types).sort().join(",");
}

function parseTypFromCandidateString(candidate?: string): IceCandidateTypeLabel {
  const line = String(candidate ?? "");
  const match = line.match(/\btyp\s+(\w+)/i);
  const typ = match?.[1]?.toLowerCase() ?? "";
  if (typ === "host" || typ === "srflx" || typ === "relay" || typ === "prflx") {
    return typ;
  }
  return "unknown";
}

export function getIceCandidateTypeLabel(
  candidate: RTCIceCandidateInit
): IceCandidateTypeLabel {
  const payload = candidate as IceCandidatePayload;
  const typed = String(payload.type ?? "").toLowerCase();
  if (
    typed === "host" ||
    typed === "srflx" ||
    typed === "relay" ||
    typed === "prflx"
  ) {
    return typed;
  }
  return parseTypFromCandidateString(
    typeof candidate.candidate === "string" ? candidate.candidate : undefined
  );
}

export function getIceCandidateDetails(candidate: RTCIceCandidateInit): {
  type: IceCandidateTypeLabel;
  protocol: string;
  address: string;
  port: string;
  foundation: string;
} {
  const payload = candidate as IceCandidatePayload;
  const type = getIceCandidateTypeLabel(candidate);
  const protocol = String(payload.protocol ?? "-");
  const address = String(payload.address ?? "-");
  const port =
    payload.port != null && Number.isFinite(payload.port)
      ? String(payload.port)
      : "-";
  const foundation = String(payload.foundation ?? "-");
  return { type, protocol, address, port, foundation };
}

export function formatIceCandidateLogValue(candidate: RTCIceCandidateInit): string {
  const { type, protocol, address, port, foundation } =
    getIceCandidateDetails(candidate);
  const line =
    typeof candidate.candidate === "string" ? candidate.candidate.trim() : "";
  const compactLine =
    line.length > 120 ? `${line.slice(0, 120)}...` : line || "-";
  return `type=${type} protocol=${protocol} address=${address} port=${port} foundation=${foundation} candidate=${compactLine}`;
}

export function recordLocalIceCandidate(
  stats: PeerIceDiagnostics,
  candidate: RTCIceCandidateInit
): void {
  const { type } = getIceCandidateDetails(candidate);
  stats.localTypes.add(type);
  stats.localCount += 1;
}

export function recordRemoteIceCandidate(
  stats: PeerIceDiagnostics,
  candidate: RTCIceCandidateInit,
  opts?: { queued?: boolean }
): void {
  const { type } = getIceCandidateDetails(candidate);
  stats.remoteTypes.add(type);
  if (opts?.queued) {
    stats.remoteQueuedCount += 1;
  } else {
    stats.remoteAddedCount += 1;
  }
}

export function logVoiceIceLocalCandidate(params: {
  remoteId: string;
  connectionId: string | null;
  candidate: RTCIceCandidateInit;
}): void {
  const details = getIceCandidateDetails(params.candidate);
  console.log(
    `[voice-ice] local-candidate remote=${compactDeviceId(params.remoteId)} ` +
      `connectionId=${compactConnectionId(params.connectionId)} ` +
      `type=${details.type} protocol=${details.protocol} address=${details.address} ` +
      `port=${details.port} foundation=${details.foundation}`
  );
}

export function logVoiceIceRemoteCandidateReceived(params: {
  remoteId: string;
  connectionId: string | null;
  candidate: RTCIceCandidateInit;
  queued: boolean;
}): void {
  const details = getIceCandidateDetails(params.candidate);
  console.log(
    `[voice-ice] remote-candidate-received remote=${compactDeviceId(params.remoteId)} ` +
      `connectionId=${compactConnectionId(params.connectionId)} ` +
      `type=${details.type} protocol=${details.protocol} address=${details.address} ` +
      `port=${details.port} foundation=${details.foundation} queued=${params.queued}`
  );
}

export function logVoiceIceAddCandidateSuccess(params: {
  remoteId: string;
  connectionId: string | null;
  candidate: RTCIceCandidateInit;
}): void {
  const details = getIceCandidateDetails(params.candidate);
  console.log(
    `[voice-ice] addIceCandidate-success remote=${compactDeviceId(params.remoteId)} ` +
      `connectionId=${compactConnectionId(params.connectionId)} type=${details.type}`
  );
}

export function logVoiceIceAddCandidateFailed(params: {
  remoteId: string;
  connectionId: string | null;
  candidate: RTCIceCandidateInit;
  name: string;
  message: string;
}): void {
  const details = getIceCandidateDetails(params.candidate);
  console.log(
    `[voice-ice] addIceCandidate-failed remote=${compactDeviceId(params.remoteId)} ` +
      `connectionId=${compactConnectionId(params.connectionId)} type=${details.type} ` +
      `name=${params.name} message=${params.message}`
  );
}

export function logVoiceIceGatheringState(params: {
  remoteId: string;
  state: string;
}): void {
  console.log(
    `[voice-ice] gathering-state remote=${compactDeviceId(params.remoteId)} state=${params.state}`
  );
}

export function logVoiceIceGatheringComplete(params: {
  remoteId: string;
  connectionId: string | null;
  stats: PeerIceDiagnostics;
}): void {
  console.log(
    `[voice-ice] gathering-complete remote=${compactDeviceId(params.remoteId)} ` +
      `connectionId=${compactConnectionId(params.connectionId)} ` +
      `localCandidateTypes=${formatIceTypeSet(params.stats.localTypes)} count=${params.stats.localCount}`
  );
}

export function logVoiceIceCheckingStuck(params: {
  remoteId: string;
  stats: PeerIceDiagnostics;
  conn: string;
  ice: string;
}): void {
  console.log(
    `[voice-ice] checking-stuck remote=${compactDeviceId(params.remoteId)} ` +
      `localTypes=${formatIceTypeSet(params.stats.localTypes)} ` +
      `remoteTypes=${formatIceTypeSet(params.stats.remoteTypes)} ` +
      `addedRemoteCandidates=${params.stats.remoteAddedCount} ` +
      `queuedRemoteCandidates=${params.stats.remoteQueuedCount} ` +
      `conn=${params.conn} ice=${params.ice}`
  );
}

export function logVoiceIceInsufficientCandidates(params: {
  remoteId: string;
  reason: "no_remote_candidates" | "host_only";
  stats: PeerIceDiagnostics;
}): void {
  console.log(
    `[voice-ice] insufficient-candidates remote=${compactDeviceId(params.remoteId)} ` +
      `reason=${params.reason} remoteTypes=${formatIceTypeSet(params.stats.remoteTypes)} ` +
      `addedRemoteCandidates=${params.stats.remoteAddedCount}`
  );
}

export function evaluateInsufficientRemoteCandidates(
  stats: PeerIceDiagnostics
): "no_remote_candidates" | "host_only" | null {
  if (stats.remoteAddedCount === 0 && stats.remoteQueuedCount === 0) {
    return "no_remote_candidates";
  }
  if (stats.remoteTypes.size === 1 && stats.remoteTypes.has("host")) {
    return "host_only";
  }
  return null;
}

export function hasNoRelayCandidates(stats: PeerIceDiagnostics): boolean {
  return !stats.localTypes.has("relay") && !stats.remoteTypes.has("relay");
}

export function logVoiceIceP2pDirectFailed(params: {
  remoteId: string;
  reason: string;
  stats: PeerIceDiagnostics;
}): void {
  console.log(
    `[voice-ice] p2p-direct-failed remote=${compactDeviceId(params.remoteId)} ` +
      `reason=${params.reason} localTypes=${formatIceTypeSet(params.stats.localTypes)} ` +
      `remoteTypes=${formatIceTypeSet(params.stats.remoteTypes)}`
  );
}
