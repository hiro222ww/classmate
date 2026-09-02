import { normalizeMatchEntryMode, type MatchEntryMode } from "@/lib/matchJoinEntryMode";

export type MatchJoinRequestBody = {
  deviceId: string;
  worldKey: string;
  topicKey: string | null;
  capacity: number;
  minAge?: number;
  maxAge?: number;
  /** voice → /call pool; chat → /room pool (separate sessions, same theme). */
  entryMode?: MatchEntryMode;
  openJoinedClass?: boolean;
  classId?: string;
  sessionId?: string;
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
  entryMode?: MatchEntryMode | string | null;
}): MatchJoinRequestBody {
  const openJoinedClassId = String(params.openJoinedClassId ?? "").trim();
  const body: MatchJoinRequestBody = {
    deviceId: params.deviceId,
    worldKey: params.worldKey ?? "default",
    topicKey: params.topicKey ?? null,
    capacity: params.capacity ?? 5,
    entryMode: openJoinedClassId
      ? "chat"
      : normalizeMatchEntryMode(params.entryMode),
  };

  if (params.minAge !== undefined) {
    body.minAge = params.minAge;
  }

  if (params.maxAge !== undefined) {
    body.maxAge = params.maxAge;
  }

  if (openJoinedClassId) {
    body.openJoinedClass = true;
    body.classId = openJoinedClassId;
    const sessionId = String(params.sessionId ?? "").trim();
    if (sessionId) {
      body.sessionId = sessionId;
    }
  }

  return body;
}
