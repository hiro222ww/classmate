import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { formatPostgresError, postgresErrorBody } from "@/lib/postgresError";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type MatchJoinAtomicV3Params = {
  deviceId: string;
  joinDisplayName: string;
  forcedClassId: string | null;
  worldKey: string;
  topicKey: string | null;
  requestedCapacity: number;
  classSlots: number;
  blockedDeviceIds: string[];
};

export type MatchJoinAtomicV3Row = {
  class_id: string;
  class_name: string;
  session_id: string;
  session_status: string | null;
  session_created_at: string | null;
  reused: boolean;
  already_joined: boolean;
  current_count: number;
};

function parseRpcDetail(error: unknown): Record<string, unknown> {
  const fields = formatPostgresError(error);
  const raw = fields.details;

  if (!raw) return {};

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function mapMatchJoinAtomicV3RpcError(error: unknown) {
  const fields = formatPostgresError(error);
  const errKey = fields.detail;
  const parsed = parseRpcDetail(error);
  const body = { ok: false as const, ...fields };

  if (fields.code === "42883") {
    return NextResponse.json(
      postgresErrorBody("rpc_type_mismatch", error, {
        message:
          "sessions.class_id (text) と uuid 変数の型不一致です。class_id::uuid キャスト修正 SQL を適用してください。",
      }),
      { status: 500 }
    );
  }

  if (fields.code === "42702") {
    return NextResponse.json(
      postgresErrorBody("rpc_ambiguous_column", error, {
        message:
          "match_join_atomic_v3 の RETURNS TABLE 列名がテーブル列と衝突しています。#variable_conflict use_column を適用してください。",
      }),
      { status: 500 }
    );
  }

  if (fields.code === "23514") {
    return NextResponse.json(
      postgresErrorBody("sessions_status_check_violation", error, {
        message:
          "sessions.status に expired が許可されていません。20260526170000 migration を適用してください。",
      }),
      { status: 500 }
    );
  }

  switch (errKey) {
    case "device_id_missing":
      return NextResponse.json({ ...body, error: errKey }, { status: 400 });

    case "class_slots_limit":
      return NextResponse.json(
        {
          ...body,
          error: errKey,
          currentCount: parsed.currentCount ?? null,
          classSlots: parsed.classSlots ?? null,
        },
        { status: 400 }
      );

    case "match_deadline_passed":
      return NextResponse.json(
        {
          ...body,
          error: errKey,
          matchDeadlineAt: parsed.matchDeadlineAt ?? null,
          message: "このマッチングは締め切られました",
        },
        { status: 400 }
      );

    case "recruitment_closed":
      return NextResponse.json(
        {
          ...body,
          error: errKey,
          sessionStatus: parsed.sessionStatus ?? null,
          message: "このクラスは現在募集していません",
        },
        { status: 403 }
      );

    case "class_not_found":
      return NextResponse.json(
        {
          ...body,
          error: errKey,
          worldKey: parsed.worldKey ?? null,
          topicKey: parsed.topicKey ?? null,
        },
        { status: 404 }
      );

    case "forced_class_not_found":
      return NextResponse.json(
        {
          ...body,
          error: errKey,
          classId: parsed.classId ?? null,
        },
        { status: 404 }
      );

    case "session_create_failed":
      return NextResponse.json(
        {
          ...body,
          error: errKey,
          classId: parsed.classId ?? null,
        },
        { status: 500 }
      );

    default:
      return NextResponse.json(
        postgresErrorBody("match_join_atomic_v3_failed", error),
        { status: 500 }
      );
  }
}

export async function callMatchJoinAtomicV3(params: MatchJoinAtomicV3Params) {
  const { data, error } = await supabase.rpc("match_join_atomic_v3", {
    p_device_id: params.deviceId,
    p_display_name: params.joinDisplayName,
    p_forced_class_id: params.forcedClassId || null,
    p_world_key: params.worldKey,
    p_topic_key: params.topicKey,
    p_requested_capacity: params.requestedCapacity,
    p_class_slots: params.classSlots,
    p_blocked_device_ids: params.blockedDeviceIds,
  });

  if (error) {
    console.error("[match-join-v2] match_join_atomic_v3 RPC failed", {
      params: {
        deviceId: params.deviceId,
        forcedClassId: params.forcedClassId,
        worldKey: params.worldKey,
        topicKey: params.topicKey,
        requestedCapacity: params.requestedCapacity,
        classSlots: params.classSlots,
        blockedDeviceCount: params.blockedDeviceIds.length,
      },
      ...formatPostgresError(error),
    });

    return {
      ok: false as const,
      response: mapMatchJoinAtomicV3RpcError(error),
    };
  }

  const row = ((data ?? [])[0] ?? null) as MatchJoinAtomicV3Row | null;

  if (!row?.class_id || !row?.session_id) {
    console.error("[match-join-v2] match_join_atomic_v3 empty result", { data });

    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "match_join_atomic_v3_empty",
          detail: "RPC returned no row",
          code: null,
          hint: null,
          details: null,
        },
        { status: 500 }
      ),
    };
  }

  return { ok: true as const, row };
}
