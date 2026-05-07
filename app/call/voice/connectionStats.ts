export type DetectedConnectionRoute = "turn" | "p2p" | "unknown";

export async function detectConnectionType(
  pc: RTCPeerConnection
): Promise<{
  route: DetectedConnectionRoute;
  localType: string | null;
  remoteType: string | null;
}> {
  const stats = await pc.getStats();

  let route: DetectedConnectionRoute = "unknown";
  let localType: string | null = null;
  let remoteType: string | null = null;

  stats.forEach((report) => {
    if (report.type === "candidate-pair" && report.state === "succeeded") {
      const local = stats.get(report.localCandidateId);
      const remote = stats.get(report.remoteCandidateId);

      localType = local?.candidateType ?? null;
      remoteType = remote?.candidateType ?? null;

      if (localType === "relay" || remoteType === "relay") {
        route = "turn";
      } else if (localType || remoteType) {
        route = "p2p";
      }
    }
  });

  return { route, localType, remoteType };
}