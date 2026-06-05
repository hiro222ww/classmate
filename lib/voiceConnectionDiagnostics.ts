"use client";

import { compactDeviceId } from "@/app/call/voice/voiceDiagnostics";
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
  const remote = compactDeviceId(pair.remoteDeviceId);
  const audio =
    pair.audioConfirmed || pair.voiceClass === "OK" ? "audio OK" : "audio not confirmed";
  const route = pair.route === "turn" ? "TURN" : pair.route === "p2p" ? "P2P" : "unknown";
  const status = pair.voiceClass === "OK" ? "OK" : `failed(${pair.voiceClass})`;
  const detail = !pair.offerReceived && pair.role === "passive"
    ? "offer_received missing"
    : !pair.offerSent && pair.role === "active"
      ? "offer_sent missing"
      : !pair.audioConfirmed && pair.iceState === "connected"
        ? "audio not confirmed"
        : "";
  return `${remote}: ${route} / ${status} / ${audio}${detail ? ` / ${detail}` : ""}`;
}

/** Callable from console with debugVoice=1: __classifyVoiceConnection() */
export function classifyVoiceConnection(remoteId?: string) {
  if (remoteId) {
    const cls = classifyVoicePipelineFailure(remoteId);
    logVoicePeerPipelineSummary(remoteId);
    return {
      class: cls,
      hint: describeVoicePipelineClass(cls),
    };
  }

  const pairs = dumpVoicePairs();
  const ctx = getVoicePeerPairContext();
  const results = pairs.map((pair) => {
    const cls = classifyVoicePipelineFailure(pair.remoteDeviceId);
    return {
      remote: pair.remoteDeviceId,
      class: cls,
      hint: describeVoicePipelineClass(cls),
      line: formatPairLine({ ...pair, voiceClass: cls }),
    };
  });

  logVoicePerfPipeline("manual-classify-all");
  console.log(
    `[voice-peer-pair] classify-all session=${ctx.sessionId.slice(-6) || "-"} ` +
      `local=${compactDeviceId(ctx.localDeviceId)} pairs=${results.length}`
  );
  for (const row of results) {
    console.log(`[voice-peer-pair] ${row.line} class=${row.class}`);
  }

  return { pairs: results };
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
