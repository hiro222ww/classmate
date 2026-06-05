import { debugConsoleLog, debugConsoleInfo } from "@/lib/debugVoiceLog";
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
  policy?: "relay" | "all";
}): void {
  const details = getIceCandidateDetails(params.candidate);
  debugConsoleLog(
    `[voice-ice] local-candidate remote=${compactDeviceId(params.remoteId)} ` +
      `connectionId=${compactConnectionId(params.connectionId)} ` +
      `type=${details.type} protocol=${details.protocol} address=${details.address} ` +
      `port=${details.port} foundation=${details.foundation}`
  );
  debugConsoleLog(
    `[voice-ice] candidate-generated remote=${compactDeviceId(params.remoteId)} ` +
      `type=${details.type} policy=${params.policy ?? "all"}`
  );
}

export function logVoiceIceCandidateSent(params: {
  remoteId: string;
  connectionId: string | null;
  candidate: RTCIceCandidateInit;
}): void {
  const details = getIceCandidateDetails(params.candidate);
  debugConsoleLog(
    `[voice-ice] candidate-sent remote=${compactDeviceId(params.remoteId)} ` +
      `connectionId=${compactConnectionId(params.connectionId)} type=${details.type}`
  );
}

export function logVoiceIceCandidateIgnored(params: {
  remoteId: string;
  connectionId?: string | null;
  reason: string;
}): void {
  debugConsoleLog(
    `[voice-ice] candidate-ignored remote=${compactDeviceId(params.remoteId)} ` +
      `connectionId=${compactConnectionId(params.connectionId)} reason=${params.reason}`
  );
}

export function logVoiceIceRemoteCandidateReceived(params: {
  remoteId: string;
  connectionId: string | null;
  candidate: RTCIceCandidateInit;
  queued: boolean;
}): void {
  const details = getIceCandidateDetails(params.candidate);
  debugConsoleLog(
    `[voice-ice] remote-candidate-received remote=${compactDeviceId(params.remoteId)} ` +
      `connectionId=${compactConnectionId(params.connectionId)} ` +
      `type=${details.type} protocol=${details.protocol} address=${details.address} ` +
      `port=${details.port} foundation=${details.foundation} queued=${params.queued}`
  );
  debugConsoleLog(
    `[voice-ice] candidate-received remote=${compactDeviceId(params.remoteId)} ` +
      `connectionId=${compactConnectionId(params.connectionId)} type=${details.type} ` +
      `queued=${params.queued}`
  );
}

export function logVoiceIceAddCandidateSuccess(params: {
  remoteId: string;
  connectionId: string | null;
  candidate: RTCIceCandidateInit;
}): void {
  const details = getIceCandidateDetails(params.candidate);
  debugConsoleLog(
    `[voice-ice] addIceCandidate-success remote=${compactDeviceId(params.remoteId)} ` +
      `connectionId=${compactConnectionId(params.connectionId)} type=${details.type}`
  );
  debugConsoleLog(
    `[voice-ice] candidate-added remote=${compactDeviceId(params.remoteId)} ` +
      `connectionId=${compactConnectionId(params.connectionId)} type=${details.type} ok=true`
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
  debugConsoleLog(
    `[voice-ice] addIceCandidate-failed remote=${compactDeviceId(params.remoteId)} ` +
      `connectionId=${compactConnectionId(params.connectionId)} type=${details.type} ` +
      `name=${params.name} message=${params.message}`
  );
}

export function logVoiceIceGatheringState(params: {
  remoteId: string;
  state: string;
}): void {
  debugConsoleLog(
    `[voice-ice] gathering-state remote=${compactDeviceId(params.remoteId)} state=${params.state}`
  );
}

export function logVoiceIceGatheringComplete(params: {
  remoteId: string;
  connectionId: string | null;
  stats: PeerIceDiagnostics;
}): void {
  debugConsoleLog(
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
  debugConsoleLog(
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
  debugConsoleLog(
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
  debugConsoleLog(
    `[voice-ice] p2p-direct-failed remote=${compactDeviceId(params.remoteId)} ` +
      `reason=${params.reason} localTypes=${formatIceTypeSet(params.stats.localTypes)} ` +
      `remoteTypes=${formatIceTypeSet(params.stats.remoteTypes)}`
  );
}

export type VoiceIceCandidatePairSnapshot = {
  selected: boolean;
  nominated: boolean;
  state: string;
  localType: string;
  remoteType: string;
  networkType: string;
  currentRoundTripTime: string;
  bytesSent: string;
  bytesReceived: string;
  route: "p2p" | "turn" | "unknown";
};

function readCandidateNetworkType(
  candidate: RTCStats | undefined
): string {
  if (!candidate) return "-";
  const raw = candidate as RTCStats & {
    networkType?: string;
    candidateType?: string;
  };
  return String(raw.networkType ?? raw.candidateType ?? "-");
}

function resolvePairRoute(
  localType: string,
  remoteType: string
): "p2p" | "turn" | "unknown" {
  if (localType === "relay" || remoteType === "relay") return "turn";
  if (
    localType === "host" ||
    localType === "srflx" ||
    localType === "prflx" ||
    remoteType === "host" ||
    remoteType === "srflx" ||
    remoteType === "prflx"
  ) {
    return "p2p";
  }
  return "unknown";
}

function readStatNumber(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.round(value));
  }
  return "-";
}

export function logVoiceIceStatsDiagnostic(params: {
  remoteId: string;
  pc: RTCPeerConnection;
  pairSnapshot: VoiceIceCandidatePairSnapshot;
  iceDiagnostics?: PeerIceDiagnostics;
}): void {
  const { remoteId, pc, pairSnapshot, iceDiagnostics } = params;
  const ice = pc.iceConnectionState;
  const conn = pc.connectionState;
  const gathering = pc.iceGatheringState;
  const sig = pc.signalingState;

  let pairTotal = 0;
  let pairInProgress = 0;
  let pairSucceeded = 0;
  let pairFailed = 0;
  let bestProgressState = "-";
  let bestProgressLocal = "-";
  let bestProgressRemote = "-";

  try {
    void pc.getStats().then((stats) => {
      stats.forEach((report) => {
        if (report.type !== "candidate-pair") return;
        pairTotal += 1;
        const state = String(
          (report as RTCStats & { state?: string }).state ?? "-"
        );
        if (state === "succeeded") pairSucceeded += 1;
        else if (state === "failed") pairFailed += 1;
        else pairInProgress += 1;

        if (
          bestProgressState === "-" &&
          (state === "in-progress" || state === "waiting")
        ) {
          const pair = report as RTCStats & {
            localCandidateId?: string;
            remoteCandidateId?: string;
          };
          const local = stats.get(String(pair.localCandidateId ?? ""));
          const remote = stats.get(String(pair.remoteCandidateId ?? ""));
          bestProgressState = state;
          bestProgressLocal = String(
            (local as RTCStats & { candidateType?: string })?.candidateType ?? "-"
          );
          bestProgressRemote = String(
            (remote as RTCStats & { candidateType?: string })?.candidateType ?? "-"
          );
        }
      });

      debugConsoleLog(
        `[voice-ice] ice-stats-diagnostic remote=${compactDeviceId(remoteId)} ` +
          `conn=${conn} ice=${ice} gathering=${gathering} sig=${sig} ` +
          `pairTotal=${pairTotal} inProgress=${pairInProgress} succeeded=${pairSucceeded} failed=${pairFailed} ` +
          `bestProgressState=${bestProgressState} bestProgressLocal=${bestProgressLocal} ` +
          `bestProgressRemote=${bestProgressRemote} ` +
          `selected=${pairSnapshot.selected} nominated=${pairSnapshot.nominated} ` +
          `localTypes=${iceDiagnostics ? formatIceTypeSet(iceDiagnostics.localTypes) : "-"} ` +
          `remoteTypes=${iceDiagnostics ? formatIceTypeSet(iceDiagnostics.remoteTypes) : "-"} ` +
          `remoteAdded=${iceDiagnostics?.remoteAddedCount ?? "-"} ` +
          `remoteQueued=${iceDiagnostics?.remoteQueuedCount ?? "-"}`
      );
    });
  } catch (e) {
    debugConsoleLog(
      `[voice-ice] ice-stats-diagnostic remote=${compactDeviceId(remoteId)} ` +
        `error=${String(e)} conn=${conn} ice=${ice}`
    );
  }
}

export async function logVoiceIceCandidatePairFromPc(
  remoteId: string,
  pc: RTCPeerConnection,
  iceDiagnostics?: PeerIceDiagnostics
): Promise<VoiceIceCandidatePairSnapshot> {
  const empty: VoiceIceCandidatePairSnapshot = {
    selected: false,
    nominated: false,
    state: "-",
    localType: "-",
    remoteType: "-",
    networkType: "-",
    currentRoundTripTime: "-",
    bytesSent: "-",
    bytesReceived: "-",
    route: "unknown",
  };

  try {
    const stats = await pc.getStats();
    let best: VoiceIceCandidatePairSnapshot | null = null;

    stats.forEach((report) => {
      if (report.type !== "candidate-pair") return;

      const pair = report as RTCStats & {
        selected?: boolean;
        nominated?: boolean;
        state?: string;
        localCandidateId?: string;
        remoteCandidateId?: string;
        currentRoundTripTime?: number;
        bytesSent?: number;
        bytesReceived?: number;
      };

      const selected = pair.selected === true;
      const nominated = pair.nominated === true;
      if (!selected && !nominated) return;

      const local = stats.get(String(pair.localCandidateId ?? ""));
      const remote = stats.get(String(pair.remoteCandidateId ?? ""));
      const localType = String(
        (local as RTCStats & { candidateType?: string })?.candidateType ?? "-"
      );
      const remoteType = String(
        (remote as RTCStats & { candidateType?: string })?.candidateType ?? "-"
      );
      const localNetwork = readCandidateNetworkType(local);
      const remoteNetwork = readCandidateNetworkType(remote);
      const networkType =
        localNetwork !== "-" ? localNetwork : remoteNetwork;
      const snapshot: VoiceIceCandidatePairSnapshot = {
        selected,
        nominated,
        state: String(pair.state ?? "-"),
        localType,
        remoteType,
        networkType,
        currentRoundTripTime: readStatNumber(pair.currentRoundTripTime),
        bytesSent: readStatNumber(pair.bytesSent),
        bytesReceived: readStatNumber(pair.bytesReceived),
        route: resolvePairRoute(localType, remoteType),
      };

      if (selected || !best || (!best.selected && nominated)) {
        best = snapshot;
      }
    });

    const result = best ?? empty;

    debugConsoleLog(
      `[voice-ice] selected-candidate-pair remote=${compactDeviceId(remoteId)} ` +
        `selected=${result.selected} nominated=${result.nominated} state=${result.state} ` +
        `localType=${result.localType} remoteType=${result.remoteType} ` +
        `networkType=${result.networkType} currentRoundTripTime=${result.currentRoundTripTime} ` +
        `bytesSent=${result.bytesSent} bytesReceived=${result.bytesReceived} route=${result.route}`
    );

    if (!result.selected && !result.nominated) {
      logVoiceIceStatsDiagnostic({
        remoteId,
        pc,
        pairSnapshot: result,
        iceDiagnostics,
      });
    }

    return result;
  } catch (e) {
    debugConsoleLog(
      `[voice-ice] selected-candidate-pair remote=${compactDeviceId(remoteId)} ` +
        `selected=false nominated=false state=error localType=- remoteType=- ` +
        `networkType=- currentRoundTripTime=- bytesSent=- bytesReceived=- ` +
        `route=unknown message=${String(e)}`
    );
    return empty;
  }
}
