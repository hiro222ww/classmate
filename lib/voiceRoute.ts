import { debugConsoleLog } from "@/lib/debugVoiceLog";
import { describeVoiceTransportMode } from "@/lib/voiceTransportMode";

export type VoiceConnectionRoute = "p2p" | "turn" | "unknown";

const P2P_CANDIDATE_TYPES = new Set(["host", "srflx", "prflx"]);

/** TURNのみ: relay 強制。P2P優先/TURN優先: all（default）。 */
export function resolveIceTransportPolicy(
  relayForced: boolean
): RTCIceTransportPolicy {
  return relayForced ? "relay" : "all";
}

export function resolveSelectedCandidateRoute(
  localType: string | null | undefined,
  remoteType: string | null | undefined
): VoiceConnectionRoute {
  const local = String(localType ?? "").trim();
  const remote = String(remoteType ?? "").trim();

  if (local === "relay" || remote === "relay") {
    return "turn";
  }

  if (P2P_CANDIDATE_TYPES.has(local) || P2P_CANDIDATE_TYPES.has(remote)) {
    return "p2p";
  }

  return "unknown";
}

export function hasTurnIceServer(iceServers: ReadonlyArray<RTCIceServer>): boolean {
  for (const server of iceServers) {
    const urls = server.urls;
    const list = Array.isArray(urls) ? urls : [urls];
    for (const raw of list) {
      const url = String(raw ?? "").trim().toLowerCase();
      if (url.startsWith("turn:") || url.startsWith("turns:")) {
        return true;
      }
    }
  }
  return false;
}

export function describeTransportConfigLabel(
  p2pEnabled: boolean,
  staticTurnEnabled: boolean
): string {
  return describeVoiceTransportMode(p2pEnabled, staticTurnEnabled);
}

export type VoiceRouteDetectResult = {
  route: VoiceConnectionRoute;
  localType: string | null;
  remoteType: string | null;
};

export async function detectSelectedConnectionRoute(
  pc: RTCPeerConnection
): Promise<VoiceRouteDetectResult> {
  const stats = await pc.getStats();
  let best: VoiceRouteDetectResult | null = null;

  stats.forEach((report) => {
    if (report.type !== "candidate-pair") return;

    const pair = report as RTCStats & {
      selected?: boolean;
      nominated?: boolean;
      state?: string;
      localCandidateId?: string;
      remoteCandidateId?: string;
    };

    const selected = pair.selected === true;
    const nominated = pair.nominated === true;
    const succeeded = String(pair.state ?? "") === "succeeded";
    if (!selected && !nominated && !succeeded) return;

    const local = stats.get(String(pair.localCandidateId ?? ""));
    const remote = stats.get(String(pair.remoteCandidateId ?? ""));
    const localType = String(
      (local as RTCStats & { candidateType?: string })?.candidateType ?? ""
    ).trim() || null;
    const remoteType = String(
      (remote as RTCStats & { candidateType?: string })?.candidateType ?? ""
    ).trim() || null;

    const candidate: VoiceRouteDetectResult = {
      route: resolveSelectedCandidateRoute(localType, remoteType),
      localType,
      remoteType,
    };

    if (selected || !best) {
      best = candidate;
    }
  });

  return (
    best ?? {
      route: "unknown",
      localType: null,
      remoteType: null,
    }
  );
}

export function logVoiceTransportSnapshot(params: {
  context: string;
  remoteId?: string;
  iceTransportPolicy: RTCIceTransportPolicy;
  turnProvider: string | null;
  iceServersCount: number;
  hasTurnServer: boolean;
  selectedLocalCandidateType?: string | null;
  selectedRemoteCandidateType?: string | null;
  route?: VoiceConnectionRoute;
  connectionState?: string;
  iceConnectionState?: string;
  transportMode?: string;
}) {
  debugConsoleLog(
    `[voice-route] ${params.context}` +
      (params.remoteId ? ` remote=${String(params.remoteId).slice(-4)}` : "") +
      ` iceTransportPolicy=${params.iceTransportPolicy}` +
      ` transportMode=${params.transportMode ?? "-"}` +
      ` turnProvider=${params.turnProvider ?? "-"}` +
      ` iceServersCount=${params.iceServersCount}` +
      ` hasTurnServer=${params.hasTurnServer}` +
      ` selectedLocalCandidateType=${params.selectedLocalCandidateType ?? "-"}` +
      ` selectedRemoteCandidateType=${params.selectedRemoteCandidateType ?? "-"}` +
      ` route=${params.route ?? "-"}` +
      ` connectionState=${params.connectionState ?? "-"}` +
      ` iceConnectionState=${params.iceConnectionState ?? "-"}`
  );
}
