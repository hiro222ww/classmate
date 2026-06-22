import { NextResponse } from "next/server";
import { getAdmissionStatus } from "@/lib/admissionWindow";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  hasClassMembershipForActor,
  type ActorLookup,
} from "@/lib/actorIdentity";

export const ADMISSION_CLOSED_MESSAGE =
  "現在は入校受付時間外です。受付時間になったら、もう一度お試しください。";

export type RejoinEligibility = {
  existingClassMember: boolean;
  existingSessionMember: boolean;
};

export function canRejoinFromEligibility(eligibility: RejoinEligibility) {
  return eligibility.existingClassMember || eligibility.existingSessionMember;
}

export async function isExistingClassMember(
  deviceId: string,
  classId: string,
  userId?: string | null
): Promise<boolean> {
  const normalizedDeviceId = String(deviceId ?? "").trim();
  const normalizedClassId = String(classId ?? "").trim();
  if (!normalizedClassId) return false;
  if (!normalizedDeviceId && !String(userId ?? "").trim()) return false;

  try {
    return await hasClassMembershipForActor(
      supabaseAdmin,
      { deviceId: normalizedDeviceId, userId: userId ?? null },
      normalizedClassId
    );
  } catch (e) {
    console.warn("[admissionMembership] class lookup error", e);
    return false;
  }
}

export async function isExistingSessionMember(
  deviceId: string,
  sessionId: string
): Promise<boolean> {
  const normalizedDeviceId = String(deviceId ?? "").trim();
  const normalizedSessionId = String(sessionId ?? "").trim();
  if (!normalizedDeviceId || !normalizedSessionId) return false;

  try {
    const { data, error } = await supabaseAdmin
      .from("session_members")
      .select("device_id")
      .eq("session_id", normalizedSessionId)
      .eq("device_id", normalizedDeviceId)
      .maybeSingle();

    if (error) {
      console.warn("[admissionMembership] session lookup failed", error);
      return false;
    }

    return Boolean(data);
  } catch (e) {
    console.warn("[admissionMembership] session lookup error", e);
    return false;
  }
}

export async function loadRejoinEligibility(params: {
  deviceId: string;
  classId: string;
  sessionId?: string;
  userId?: string | null;
}): Promise<RejoinEligibility> {
  const [existingClassMember, existingSessionMember] = await Promise.all([
    isExistingClassMember(params.deviceId, params.classId, params.userId),
    params.sessionId
      ? isExistingSessionMember(params.deviceId, params.sessionId)
      : Promise.resolve(false),
  ]);

  return { existingClassMember, existingSessionMember };
}

export async function loadRejoinEligibilityForActor(
  actor: ActorLookup,
  params: { classId: string; sessionId?: string }
): Promise<RejoinEligibility> {
  return loadRejoinEligibility({
    deviceId: actor.deviceId,
    userId: actor.userId,
    classId: params.classId,
    sessionId: params.sessionId,
  });
}

/** 既存メンバー再入室は bypass。未所属の新規参加のみ受付時間を確認する。 */
export async function blockNewJoinIfAdmissionClosed(params: {
  deviceId: string;
  classId: string;
  sessionId?: string;
}): Promise<NextResponse | null> {
  const eligibility = await loadRejoinEligibility(params);

  if (canRejoinFromEligibility(eligibility)) {
    return null;
  }

  const admission = await getAdmissionStatus();

  if (!admission.open) {
    return NextResponse.json(
      {
        ok: false,
        error: "admission_closed",
        admission,
        message: ADMISSION_CLOSED_MESSAGE,
      },
      { status: 403 }
    );
  }

  return null;
}
