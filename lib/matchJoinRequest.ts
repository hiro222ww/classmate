import type { JoinMode } from "@/lib/joinMode";

export type MatchJoinRequestBody = {
  deviceId: string;
  worldKey: string;
  topicKey: string | null;
  capacity: number;
  minAge?: number;
  maxAge?: number;
  openJoinedClass?: boolean;
  classId?: string;
  sessionId?: string;
  /** Client-only hint for future theme+mode match pools; server ignores today. */
  intentMode?: JoinMode;
};

/**
 * Normal match: omit classId / openJoinedClass.
 * Open joined class only: set openJoinedClassId (sends openJoinedClass + classId).
 */
export function buildMatchJoinRequestBody(params: {
  deviceId: string;
  worldKey?: string;
  topicKey?: string | null;
  capacity?: number;
  minAge?: number;
  maxAge?: number;
  openJoinedClassId?: string | null;
  sessionId?: string | null;
  intentMode?: JoinMode;
}): MatchJoinRequestBody {
  const body: MatchJoinRequestBody = {
    deviceId: params.deviceId,
    worldKey: params.worldKey ?? "default",
    topicKey: params.topicKey ?? null,
    capacity: params.capacity ?? 5,
  };

  if (params.minAge !== undefined) {
    body.minAge = params.minAge;
  }

  if (params.maxAge !== undefined) {
    body.maxAge = params.maxAge;
  }

  const openJoinedClassId = String(params.openJoinedClassId ?? "").trim();

  if (openJoinedClassId) {
    body.openJoinedClass = true;
    body.classId = openJoinedClassId;
    const sessionId = String(params.sessionId ?? "").trim();
    if (sessionId) {
      body.sessionId = sessionId;
    }
  }

  if (params.intentMode) {
    body.intentMode = params.intentMode;
  }

  return body;
}
