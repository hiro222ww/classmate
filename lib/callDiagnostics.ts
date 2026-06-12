import {
  debugConsoleLog,
  voiceProdLogOnStateChange,
} from "@/lib/debugVoiceLog";

export function tailDeviceId(deviceId: string) {
  const id = String(deviceId ?? "").trim();
  return id ? id.slice(-4) : "-";
}

export function tailSessionId(sessionId: string) {
  const id = String(sessionId ?? "").trim();
  return id ? id.slice(-6) : "-";
}

export function computeRemoteMemberIds(
  members: Array<{ device_id?: string | null }>,
  deviceId: string
) {
  const selfId = String(deviceId ?? "").trim();
  return members
    .map((m) => String(m.device_id ?? "").trim())
    .filter((id) => id && id !== selfId);
}

export function resolveVoiceLayerBlockingReason(params: {
  sessionId: string;
  deviceId: string;
  membersCount: number;
}) {
  if (!String(params.sessionId ?? "").trim()) return "no_session_id";
  if (!String(params.deviceId ?? "").trim()) return "no_device_id";
  if (params.membersCount <= 0) return "no_members";
  return "-";
}

export function logCallMembersDebug(params: {
  deviceId: string;
  members: Array<{ device_id?: string | null }>;
}) {
  const selfId = String(params.deviceId ?? "").trim();
  const displayMemberIds = params.members
    .map((m) => String(m.device_id ?? "").trim())
    .filter(Boolean)
    .map((id) => id.slice(-4));
  const remoteMemberIds = computeRemoteMemberIds(params.members, selfId).map(
    (id) => id.slice(-4)
  );
  const selfFound = params.members.some(
    (m) => String(m.device_id ?? "").trim() === selfId
  );
  const stateKey =
    `display=[${displayMemberIds.join(",")}]` +
    `|remote=[${remoteMemberIds.join(",")}]|selfFound=${selfFound ? 1 : 0}`;

  voiceProdLogOnStateChange(
    `call-members-debug:${tailDeviceId(selfId)}`,
    stateKey,
    `[call-members-debug] deviceId=${tailDeviceId(selfId)} ` +
      `displayMemberIds=[${displayMemberIds.join(",")}] ` +
      `remoteMemberIds=[${remoteMemberIds.join(",")}] selfFound=${selfFound ? 1 : 0}`
  );
}

export function logCallRender(params: {
  sessionId: string;
  classId: string;
  deviceId: string;
  displayMembers: number;
  remoteMembers: number;
  localStreamReady: boolean;
  micReady: boolean;
  voiceLayerShouldRender: boolean;
  blockingReason: string;
}) {
  const stateKey =
    `${params.displayMembers}|${params.remoteMembers}|` +
    `${params.localStreamReady ? 1 : 0}|${params.micReady ? 1 : 0}|` +
    `${params.voiceLayerShouldRender ? 1 : 0}|${params.blockingReason}`;

  voiceProdLogOnStateChange(
    `call-render:${tailSessionId(params.sessionId)}:${tailDeviceId(params.deviceId)}`,
    stateKey,
    `[call-render] sessionId=${tailSessionId(params.sessionId)} ` +
      `classId=${tailSessionId(params.classId)} deviceId=${tailDeviceId(params.deviceId)} ` +
      `displayMembers=${params.displayMembers} remoteMembers=${params.remoteMembers} ` +
      `localStreamReady=${params.localStreamReady ? 1 : 0} micReady=${params.micReady ? 1 : 0} ` +
      `voiceLayerShouldRender=${params.voiceLayerShouldRender ? 1 : 0} ` +
      `blockingReason=${params.blockingReason}`
  );
}

export function logVoiceLayerRenderCheck(params: {
  shouldRender: boolean;
  blockingReason: string;
  sessionId: string;
  deviceId: string;
  members: number;
  remoteMembers: number;
  localStreamReady: boolean;
  micReady: boolean;
}) {
  debugConsoleLog(
    `[voice-layer-render-check] shouldRender=${params.shouldRender ? 1 : 0} ` +
      `blockingReason=${params.blockingReason} ` +
      `sessionId=${tailSessionId(params.sessionId)} deviceId=${tailDeviceId(params.deviceId)} ` +
      `members=${params.members} remoteMembers=${params.remoteMembers} ` +
      `localStreamReady=${params.localStreamReady ? 1 : 0} micReady=${params.micReady ? 1 : 0}`
  );
}
