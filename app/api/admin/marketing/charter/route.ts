import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import {
  approveMemoAsPolicy,
  createPolicyManual,
  listMemos,
  listPolicies,
  listRevisions,
  restorePolicyVersion,
  setPolicyStatus,
  submitCharterMemo,
  updatePolicy,
  type CharterCategory,
  type CharterImportance,
  type CharterStatus,
  CHARTER_CATEGORY_LABELS,
} from "@/lib/marketing/operatingCharter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MIGRATION_HINT =
  "ai_operating_policies 未適用の可能性があります。マイグレーション 20261117210000_ai_operating_charter.sql を承認後に適用してください。";

function migrationHint(detail?: string) {
  if (detail && /does not exist|schema cache/i.test(detail)) return MIGRATION_HINT;
  return undefined;
}

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const view = url.searchParams.get("view") || "policies";
  const policyId = url.searchParams.get("policyId");

  try {
    if (view === "memos") {
      const memos = await listMemos(50);
      return NextResponse.json({ ok: true, memos, categories: CHARTER_CATEGORY_LABELS });
    }
    if (view === "revisions" && policyId) {
      const revisions = await listRevisions(policyId);
      return NextResponse.json({ ok: true, revisions });
    }
    const status = (url.searchParams.get("status") || "open") as
      | CharterStatus
      | "open"
      | "all";
    const policies = await listPolicies({ status, limit: 100 });
    return NextResponse.json({
      ok: true,
      policies,
      categories: CHARTER_CATEGORY_LABELS,
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "charter_list_failed";
    return NextResponse.json(
      {
        ok: false,
        error: "charter_list_failed",
        detail,
        migrationHint: migrationHint(detail),
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = String(body?.action ?? "").trim();

  try {
    if (action === "memo") {
      const text = String(body?.text ?? "");
      const result = await submitCharterMemo(text);
      if (!result.ok) {
        return NextResponse.json(
          { ...result, migrationHint: migrationHint(result.detail) },
          { status: result.error === "secrets_not_allowed" ? 400 : 500 }
        );
      }
      return NextResponse.json({
        ok: true,
        memo: result.memo,
        classification: result.classification,
      });
    }

    if (action === "create") {
      const result = await createPolicyManual({
        category: body?.category as CharterCategory,
        title: String(body?.title ?? ""),
        body: String(body?.body ?? ""),
        importance: (body?.importance as CharterImportance) || "medium",
        status:
          (body?.status as "active" | "idea_unadopted" | "pending_approval") ||
          "active",
        changeNote: body?.changeNote ? String(body.changeNote) : undefined,
      });
      if (!result.ok) {
        return NextResponse.json(
          { ...result, migrationHint: migrationHint(result.detail) },
          { status: 400 }
        );
      }
      return NextResponse.json({ ok: true, policy: result.policy });
    }

    if (action === "update") {
      const result = await updatePolicy({
        id: String(body?.id ?? ""),
        title: body?.title != null ? String(body.title) : undefined,
        body: body?.body != null ? String(body.body) : undefined,
        category: body?.category as CharterCategory | undefined,
        importance: body?.importance as CharterImportance | undefined,
        changeNote: body?.changeNote ? String(body.changeNote) : undefined,
      });
      if (!result.ok) {
        return NextResponse.json(result, { status: 400 });
      }
      return NextResponse.json({ ok: true, policy: result.policy });
    }

    if (action === "set_status") {
      const result = await setPolicyStatus({
        id: String(body?.id ?? ""),
        status: body?.status as "active" | "inactive" | "idea_unadopted" | "archived",
        changeNote: body?.changeNote ? String(body.changeNote) : undefined,
      });
      if (!result.ok) {
        return NextResponse.json(result, { status: 400 });
      }
      return NextResponse.json({ ok: true, policy: result.policy });
    }

    if (action === "approve_memo") {
      const result = await approveMemoAsPolicy({
        memoId: String(body?.memoId ?? ""),
        activate: Boolean(body?.activate),
      });
      if (!result.ok) {
        return NextResponse.json(result, { status: 400 });
      }
      return NextResponse.json({ ok: true, policy: result.policy });
    }

    if (action === "restore") {
      const result = await restorePolicyVersion({
        policyId: String(body?.policyId ?? ""),
        version: Number(body?.version),
      });
      if (!result.ok) {
        return NextResponse.json(result, { status: 400 });
      }
      return NextResponse.json({ ok: true, policy: result.policy });
    }

    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "charter_action_failed";
    return NextResponse.json(
      {
        ok: false,
        error: "charter_action_failed",
        detail,
        migrationHint: migrationHint(detail),
      },
      { status: 500 }
    );
  }
}
