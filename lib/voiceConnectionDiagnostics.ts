"use client";

import {
  classifyVoicePipelineFailure,
  describeVoicePipelineClass,
  logVoicePeerPipelineSummary,
  logVoicePerfPipeline,
} from "@/lib/voicePerf";

/** Callable from console with debugVoice=1: __classifyVoiceConnection() */
export function classifyVoiceConnection(remoteId?: string) {
  const cls = classifyVoicePipelineFailure(remoteId);
  if (remoteId) {
    logVoicePeerPipelineSummary(remoteId);
  } else {
    logVoicePerfPipeline("manual-classify");
  }
  return {
    class: cls,
    hint: describeVoicePipelineClass(cls),
  };
}

if (typeof window !== "undefined") {
  try {
    (globalThis as Record<string, unknown>).__classifyVoiceConnection =
      classifyVoiceConnection;
  } catch {
    /* ignore */
  }
}
