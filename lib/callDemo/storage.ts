import {
  CALL_DEMO_STORAGE_KEY,
  createDefaultCallDemoState,
  createDefaultRoster,
} from "./defaults";
import type { CallDemoMember, CallDemoState } from "./types";

function isMember(value: unknown): value is CallDemoMember {
  if (!value || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  return typeof m.id === "string" && typeof m.displayName === "string";
}

export function sanitizeCallDemoState(raw: unknown): CallDemoState {
  const fallback = createDefaultCallDemoState();
  if (!raw || typeof raw !== "object") return fallback;
  const input = raw as Partial<CallDemoState>;

  const memberCount = ([1, 2, 3, 4, 5] as const).includes(
    input.memberCount as 1 | 2 | 3 | 4 | 5
  )
    ? (input.memberCount as 1 | 2 | 3 | 4 | 5)
    : 3;

  const rosterBase = createDefaultRoster();
  const incoming = Array.isArray(input.members)
    ? input.members.filter(isMember)
    : [];
  const members = rosterBase.map((slot, i) => {
    const found = incoming[i];
    if (!found) return slot;
    return {
      ...slot,
      ...found,
      id: slot.id,
    };
  });

  return {
    version: 1,
    memberCount,
    members,
    board: {
      ...fallback.board,
      ...(input.board ?? {}),
    },
    filmingMode: input.filmingMode === true,
    showDemoBadge: input.showDemoBadge !== false,
    autoSpeak: input.autoSpeak === true,
    autoSpeakIntervalMs: Math.min(
      10_000,
      Math.max(800, Number(input.autoSpeakIntervalMs) || 2500)
    ),
    dualSpeak: input.dualSpeak === true,
    speakIndex: Number.isFinite(Number(input.speakIndex))
      ? Number(input.speakIndex)
      : 0,
    uiScene: input.uiScene ?? "connected",
    selfMuted: input.selfMuted === true,
    selfListenOnly: input.selfListenOnly === true,
    micLevel: Math.min(1, Math.max(0, Number(input.micLevel) || 0.12)),
    capacity: Math.min(5, Math.max(1, Number(input.capacity) || 5)),
  };
}

export function loadCallDemoState(): CallDemoState {
  if (typeof window === "undefined") return createDefaultCallDemoState();
  try {
    const raw = window.localStorage.getItem(CALL_DEMO_STORAGE_KEY);
    if (!raw) return createDefaultCallDemoState();
    return sanitizeCallDemoState(JSON.parse(raw));
  } catch {
    return createDefaultCallDemoState();
  }
}

export function saveCallDemoState(state: CallDemoState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CALL_DEMO_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / private mode
  }
}

export function clearCallDemoState() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CALL_DEMO_STORAGE_KEY);
  } catch {
    // ignore
  }
}
