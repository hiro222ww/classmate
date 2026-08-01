import type {
  CallDemoBoard,
  CallDemoMember,
  CallDemoPresetId,
  CallDemoState,
} from "./types";

export const CALL_DEMO_STORAGE_KEY = "classmate_call_demo_v1";
export const CALL_DEMO_SPEAKING_MS = 1500;

export const OFFICIAL_MEMBERS: CallDemoMember[] = [
  {
    id: "demo-meika",
    displayName: "めいか",
    avatarUrl: "/demo/meika.svg",
    genderLabel: "女性",
    ageLabel: "20代",
    muted: false,
    listenOnly: false,
    online: true,
    inCall: true,
    speaking: false,
    isSelf: true,
  },
  {
    id: "demo-meito",
    displayName: "めいと",
    avatarUrl: "/demo/meito.svg",
    genderLabel: "男性",
    ageLabel: "20代",
    muted: false,
    listenOnly: false,
    online: true,
    inCall: true,
    speaking: true,
    isSelf: false,
  },
  {
    id: "demo-kurato",
    displayName: "くらと",
    avatarUrl: "/demo/kurato.svg",
    genderLabel: "男性",
    ageLabel: "30代",
    muted: false,
    listenOnly: false,
    online: true,
    inCall: true,
    speaking: false,
    isSelf: false,
  },
];

export const EXTRA_MEMBERS: CallDemoMember[] = [
  {
    id: "demo-user-d",
    displayName: "ユーザーD",
    avatarUrl: "/demo/user-d.svg",
    genderLabel: "女性",
    ageLabel: "20代",
    muted: true,
    listenOnly: false,
    online: true,
    inCall: true,
    speaking: false,
    isSelf: false,
  },
  {
    id: "demo-user-e",
    displayName: "ユーザーE",
    avatarUrl: "/demo/user-e.svg",
    genderLabel: "男性",
    ageLabel: "40代",
    muted: false,
    listenOnly: true,
    online: true,
    inCall: true,
    speaking: false,
    isSelf: false,
  },
];

export const GENERIC_USER_MEMBERS: CallDemoMember[] = [
  {
    id: "demo-user-a",
    displayName: "ユーザーA",
    avatarUrl: "/demo/user-a.svg",
    genderLabel: "女性",
    ageLabel: "20代",
    muted: false,
    listenOnly: false,
    online: true,
    inCall: true,
    speaking: true,
    isSelf: true,
  },
  {
    id: "demo-user-b",
    displayName: "ユーザーB",
    avatarUrl: "/demo/user-b.svg",
    genderLabel: "男性",
    ageLabel: "30代",
    muted: false,
    listenOnly: false,
    online: true,
    inCall: true,
    speaking: false,
    isSelf: false,
  },
  {
    id: "demo-user-c",
    displayName: "ユーザーC",
    avatarUrl: "/demo/user-c.svg",
    genderLabel: "女性",
    ageLabel: "20代",
    muted: true,
    listenOnly: false,
    online: true,
    inCall: true,
    speaking: false,
    isSelf: false,
  },
];

export const DEFAULT_BOARD: CallDemoBoard = {
  className: "放課後クラス",
  boardTitle: "今日のテーマ",
  boardBody: "最近ハマっていること",
  conversationTheme: "雑談",
  classroomTheme: "放課後",
  backgroundTheme: "default",
  statusText: "通話中",
  showBoard: true,
};

function cloneMembers(list: CallDemoMember[]): CallDemoMember[] {
  return list.map((m) => ({ ...m }));
}

export function createDefaultRoster(): CallDemoMember[] {
  return cloneMembers([...OFFICIAL_MEMBERS, ...EXTRA_MEMBERS]);
}

export function createDefaultCallDemoState(): CallDemoState {
  return {
    version: 1,
    memberCount: 3,
    members: createDefaultRoster(),
    board: { ...DEFAULT_BOARD },
    filmingMode: false,
    showDemoBadge: true,
    autoSpeak: true,
    autoSpeakIntervalMs: 2500,
    dualSpeak: false,
    speakIndex: 1,
    uiScene: "connected",
    selfMuted: false,
    selfListenOnly: false,
    micLevel: 0.12,
    capacity: 5,
  };
}

export function applyMemberCount(
  members: CallDemoMember[],
  count: 1 | 2 | 3 | 4 | 5
): CallDemoMember[] {
  const roster = members.length >= 5 ? members : createDefaultRoster();
  // Preserve edits for hidden slots; only mark visibility via count at render.
  return roster.slice(0, 5).map((m, i) => ({
    ...m,
    online: i < count ? m.online : false,
    inCall: i < count ? m.inCall : false,
    speaking: i < count ? m.speaking : false,
  }));
}

export function visibleDemoMembers(
  state: CallDemoState
): CallDemoMember[] {
  const slotted = state.members.slice(0, state.memberCount);
  // Waiting / ended scenes still show roster for filming; hide only explicit offline.
  if (
    state.uiScene === "waiting" ||
    state.uiScene === "call_ended" ||
    state.uiScene === "class_just_started"
  ) {
    return slotted.filter((m) => m.online);
  }
  return slotted.filter((m) => m.inCall && m.online);
}

export function applySpeakingSelection(
  members: CallDemoMember[],
  memberCount: number,
  speakIndex: number,
  dualSpeak: boolean
): CallDemoMember[] {
  const active = members.slice(0, memberCount);
  const primary = ((speakIndex % Math.max(1, active.length)) + active.length) %
    Math.max(1, active.length);
  const secondary =
    dualSpeak && active.length > 1 ? (primary + 1) % active.length : -1;

  return members.map((m, i) => {
    if (i >= memberCount) return { ...m, speaking: false };
    if (m.muted || m.listenOnly) return { ...m, speaking: false };
    return {
      ...m,
      speaking: i === primary || i === secondary,
    };
  });
}

export function createPresetState(id: CallDemoPresetId): CallDemoState {
  const base = createDefaultCallDemoState();

  if (id === "official3") {
    return {
      ...base,
      memberCount: 3,
      members: applySpeakingSelection(createDefaultRoster(), 3, 1, false),
      autoSpeak: true,
      board: { ...DEFAULT_BOARD, showBoard: true },
      uiScene: "connected",
      speakIndex: 1,
    };
  }

  if (id === "users3") {
    const roster = [
      ...cloneMembers(GENERIC_USER_MEMBERS),
      ...cloneMembers(EXTRA_MEMBERS),
    ];
    return {
      ...base,
      memberCount: 3,
      members: applySpeakingSelection(roster, 3, 0, false),
      autoSpeak: true,
      board: {
        ...DEFAULT_BOARD,
        className: "週末クラス",
        boardBody: "今週のよかったこと",
        showBoard: true,
      },
      speakIndex: 0,
      uiScene: "connected",
    };
  }

  if (id === "max5") {
    const roster = applySpeakingSelection(createDefaultRoster(), 5, 0, false).map(
      (m, i) => ({
        ...m,
        muted: i === 3,
        listenOnly: i === 4,
        speaking: i === 0,
      })
    );
    return {
      ...base,
      memberCount: 5,
      members: roster,
      autoSpeak: true,
      autoSpeakIntervalMs: 2000,
      dualSpeak: false,
      speakIndex: 0,
      uiScene: "connected",
      board: {
        ...DEFAULT_BOARD,
        className: "にぎやかクラス",
        boardBody: "みんなで話そう",
      },
    };
  }

  if (id === "joinDemo") {
    const roster = createDefaultRoster().map((m, i) => ({
      ...m,
      inCall: i < 2,
      speaking: i === 0,
    }));
    return {
      ...base,
      memberCount: 2,
      members: roster,
      autoSpeak: false,
      speakIndex: 0,
      uiScene: "member_join",
      board: { ...DEFAULT_BOARD, statusText: "メンバー追加" },
    };
  }

  // leaveDemo
  const roster = createDefaultRoster().map((m, i) => ({
    ...m,
    inCall: i < 3,
    speaking: i === 1,
  }));
  return {
    ...base,
    memberCount: 3,
    members: roster,
    autoSpeak: false,
    speakIndex: 1,
    uiScene: "member_leave",
    board: { ...DEFAULT_BOARD, statusText: "メンバー退出" },
  };
}

export const PRESET_LABELS: Record<CallDemoPresetId, string> = {
  official3: "公式キャラクター3人",
  users3: "一般ユーザー3人",
  max5: "最大人数",
  joinDemo: "入室デモ",
  leaveDemo: "退出デモ",
};
