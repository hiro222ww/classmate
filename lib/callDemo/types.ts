export type CallDemoUiScene =
  | "connected"
  | "connecting"
  | "reconnecting"
  | "mic_off"
  | "listen_only"
  | "exit_confirm"
  | "member_join"
  | "member_leave"
  | "waiting"
  | "class_just_started"
  | "call_ended";

export type CallDemoMember = {
  id: string;
  displayName: string;
  avatarUrl: string;
  genderLabel: string;
  ageLabel: string;
  muted: boolean;
  listenOnly: boolean;
  online: boolean;
  inCall: boolean;
  speaking: boolean;
  isSelf: boolean;
};

export type CallDemoBoard = {
  className: string;
  boardTitle: string;
  boardBody: string;
  conversationTheme: string;
  classroomTheme: string;
  backgroundTheme: string;
  statusText: string;
  showBoard: boolean;
};

export type CallDemoState = {
  version: 1;
  memberCount: 1 | 2 | 3 | 4 | 5;
  members: CallDemoMember[];
  board: CallDemoBoard;
  filmingMode: boolean;
  showDemoBadge: boolean;
  autoSpeak: boolean;
  autoSpeakIntervalMs: number;
  dualSpeak: boolean;
  speakIndex: number;
  uiScene: CallDemoUiScene;
  selfMuted: boolean;
  selfListenOnly: boolean;
  micLevel: number;
  capacity: number;
};

export type CallDemoPresetId =
  | "official3"
  | "users3"
  | "max5"
  | "joinDemo"
  | "leaveDemo";
