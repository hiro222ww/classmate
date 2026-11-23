export const EXPERIENCE_FEATURE_SETTING_KEY =
  "experience_sessions_feature_enabled";

export const EXPERIENCE_TOPIC_KEY = "experience_session";
export const EXPERIENCE_MAX_MEMBERS = 5;

export type ExperienceEventStatus = "scheduled" | "cancelled" | "ended";

export type ExperiencePhase =
  | "hidden"
  | "upcoming"
  | "live"
  | "full"
  | "ended";

export type ExperienceEventRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: ExperienceEventStatus;
  max_members: number;
  class_id: string | null;
  session_id: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ExperiencePublicStatus = {
  ok: true;
  featureEnabled: boolean;
  phase: ExperiencePhase;
  event: null | {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    maxMembers: number;
    memberCount: number;
    startsAtLabelJst: string;
    endsAtLabelJst: string;
  };
  /** Clear end-of-event behavior for clients. */
  endBehavior: {
    newJoinsAfterEnd: "rejected";
    inCallAfterEnd: "may_continue_until_leave";
    emptyRoomAfterEnd: "may_close";
  };
};

export type ExperienceJoinResult =
  | {
      ok: true;
      eventId: string;
      sessionId: string;
      classId: string;
      memberCount: number;
      maxMembers: number;
      endsAt: string;
      rejoined?: boolean;
    }
  | {
      ok: false;
      error: string;
      memberCount?: number;
      maxMembers?: number;
    };
