/**
 * When Home overlays /api/session/status onto /api/class/members, keep
 * call-status fields AND retain the richer photo fields from either side.
 * Previously only is_in_call/screen/last_seen were copied, so status photos
 * were dropped when class/members lacked photo_path.
 */

import { mergeMemberProfileFields } from "@/lib/memberProfileMerge";

export type HomeMemberPhotoRow = {
  device_id?: string | null;
  display_name?: string | null;
  photo_path?: string | null;
  avatar_url?: string | null;
  is_in_call?: boolean | null;
  screen?: string | null;
  last_seen_at?: string | null;
  presence_session_id?: string | null;
  [key: string]: unknown;
};

export function mergeHomeMemberWithSessionStatus<T extends HomeMemberPhotoRow>(
  member: T,
  statusMember: T
): T {
  const callFields = {
    ...member,
    is_in_call: statusMember.is_in_call === true,
    screen: statusMember.screen ?? member.screen ?? null,
    last_seen_at: statusMember.last_seen_at ?? member.last_seen_at ?? null,
    presence_session_id:
      statusMember.presence_session_id ?? member.presence_session_id ?? null,
  } as T;

  return mergeMemberProfileFields(callFields, statusMember);
}
