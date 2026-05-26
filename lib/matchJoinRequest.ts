export type MatchJoinRequestBody = {
  deviceId: string;
  worldKey: string;
  topicKey: string | null;
  capacity: number;
  minAge?: number;
  maxAge?: number;
  openJoinedClass?: boolean;
  classId?: string;
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
  }

  return body;
}
