"use client";

import { compactDeviceId } from "@/app/call/voice/voiceDiagnostics";
import {
  buildPairClassifyEntry,
  computeOverallPairStatus,
  formatAdminPairSummaryLine,
} from "@/lib/voicePeerPairDiagnostics";
import {
  classifyVoicePipelineFailure,
  describeVoicePipelineClass,
  logVoicePeerPipelineSummary,
  logVoicePerfPipeline,
} from "@/lib/voicePerf";
import {
  dumpVoicePairs,
  getVoicePeerPairContext,
  type VoicePeerPairSnapshot,
} from "@/lib/voicePeerPairRegistry";

function formatPairLine(pair: VoicePeerPairSnapshot): string {
  return formatAdminPairSummaryLine(pair);
}

/** Callable from console with debugVoice=1: __classifyVoiceConnection() */
export function classifyVoiceConnection(remoteId?: string) {
  if (remoteId) {
    const pairs = dumpVoicePairs();
    const pair =
      pairs.find((row) => row.remoteDeviceId === remoteId) ??
      pairs.find(
        (row) => compactDeviceId(row.remoteDeviceId) === compactDeviceId(remoteId)
      );
    const cls = pair?.voiceClass ?? classifyVoicePipelineFailure(remoteId);
    logVoicePeerPipelineSummary(remoteId);
    return {
      class: cls,
      subClass: pair?.subClass ?? null,
      hint: describeVoicePipelineClass(cls),
      pair: pair ? buildPairClassifyEntry(pair) : null,
    };
  }

  const pairs = dumpVoicePairs();
  const ctx = getVoicePeerPairContext();
  const pairMap: Record<
    string,
    ReturnType<typeof buildPairClassifyEntry>
  > = {};

  for (const pair of pairs) {
    const key = compactDeviceId(pair.remoteDeviceId);
    pairMap[key] = buildPairClassifyEntry(pair);
  }

  const overall = computeOverallPairStatus(pairs);

  logVoicePerfPipeline("manual-classify-all");
  console.log(
    `[voice-peer-pair] classify-all session=${ctx.sessionId.slice(-6) || "-"} ` +
      `local=${compactDeviceId(ctx.localDeviceId)} pairs=${pairs.length} overall=${overall}`
  );
  for (const pair of pairs) {
    const entry = buildPairClassifyEntry(pair);
    console.log(
      `[voice-peer-pair] ${formatPairLine(pair)} class=${entry.class}` +
        (entry.subClass ? ` sub=${entry.subClass}` : "")
    );
  }

  return { overall, pairs: pairMap };
}

/** Callable from console with debugVoice=1: __dumpVoicePairs() */
export function dumpVoicePairsForConsole() {
  const pairs = dumpVoicePairs();
  const ctx = getVoicePeerPairContext();
  console.log(
    `[voice-peer-pair] dump session=${ctx.sessionId.slice(-6) || "-"} ` +
      `local=${compactDeviceId(ctx.localDeviceId)} count=${pairs.length}`
  );
  for (const pair of pairs) {
    console.log(formatPairLine(pair));
    console.log(
      `[voice-peer-pair] detail remote=${compactDeviceId(pair.remoteDeviceId)} ` +
        `role=${pair.role} route=${pair.route} offerSent=${pair.offerSent} ` +
        `offerReceived=${pair.offerReceived} answerSent=${pair.answerSent} ` +
        `answerReceived=${pair.answerReceived} iceSent=${pair.iceSent} ` +
        `iceReceived=${pair.iceReceived} track=${pair.remoteTrackReceived} ` +
        `audioStrict=${pair.audioConfirmedStrict} class=${pair.voiceClass} ` +
        `sub=${pair.subClass ?? "-"} signalIssue=${pair.signalingIssue ?? "-"}`
    );
  }
  return pairs;
}

if (typeof window !== "undefined") {
  try {
    (globalThis as Record<string, unknown>).__classifyVoiceConnection =
      classifyVoiceConnection;
    (globalThis as Record<string, unknown>).__dumpVoicePairs =
      dumpVoicePairsForConsole;
  } catch {
    /* ignore */
  }
}
