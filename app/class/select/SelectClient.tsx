"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { markAutoCallOnce } from "@/lib/autoCallOnce";
import { getDeviceId } from "@/lib/device";
import { pushRecentClass } from "@/lib/recentClasses";
import { DevModeSwitcher } from "@/components/DevModeSwitcher";
import { isDevFeatureEnabled } from "@/lib/devMode";
import { buildMatchJoinRequestBody } from "@/lib/matchJoinRequest";
import { isSessionEligibleForNormalJoin } from "@/lib/recruitment";
import { GENDER_RESTRICTED_TOPIC_MESSAGE } from "@/lib/genderRestriction";
import { isUserProfileComplete } from "@/lib/profileClient";
import { buildProfileEditPath } from "@/lib/profileNavigation";
import { tierName } from "@/lib/planTiers";
import { DEVICE_RESET_CONFIRM_MESSAGE, resetClassmateDeviceState } from "@/lib/deviceReset";
import {
  logDeviceEnsureFailed,
  logDeviceEnsureStart,
  logDeviceEnsureSuccess,
  logMatchJoinClientFailed,
  logMatchJoinClientStart,
  logMatchJoinClientSuccess,
  logProfileExists,
} from "@/lib/entryFlowLog";
import { isJoinAllowedDeviceId, isLegacyStoredDeviceId } from "@/lib/deviceIdValidation";
import { resolveMatchJoinUserMessage } from "@/lib/matchJoinUserMessage";
import { EntryFailurePanel } from "@/components/EntryFailurePanel";
import { HelpTip } from "@/components/HelpTip";
import { AgeFilterCard } from "@/components/dashboard/AgeFilterCard";
import { DashboardStatusBar } from "@/components/dashboard/DashboardStatusBar";
import { JoinNewCard } from "@/components/dashboard/JoinNewCard";
import { ReturnClassCard } from "@/components/dashboard/ReturnClassCard";
import { useCurrentClass } from "@/components/dashboard/useCurrentClass";
import {
  AGE_FILTER_OFF_PREFS,
  isAgeFilterOff,
  matchPrefsForSubmit,
  type MatchPrefs,
} from "@/components/dashboard/ageFilterConstants";
import {
  DASH_CARD,
  HOME_DASHBOARD_LAYOUT_CSS,
  PRIMARY_BTN,
} from "@/components/dashboard/dashboardStyles";

type World = {
  world_key: string;
  title: string;
  description: string;
  is_sensitive: boolean;
  min_age: number;
  is_premium: boolean;
};

type Topic = {
  topic_key: string;
  title: string;
  description: string;
  is_sensitive: boolean;
  min_age: number;
  monthly_price?: number;
  is_premium?: boolean;
};

type ClassRow = {
  id: string;
  name: string;
  description: string;
  world_key: string | null;
  topic_key: string | null;
  min_age: number;
  is_sensitive: boolean;
  is_premium?: boolean;
  is_user_created: boolean;
  created_at?: string;
};

type Entitlements = {
  plan: string;
  class_slots: number;
  can_create_classes: boolean;
  topic_plan?: number;
  theme_pass?: boolean;
};

type Profile = {
  device_id: string;
  display_name: string;
  birth_date: string;
  gender: "male" | "female";
  photo_path: string | null;
};

type ProfileApiResponse = {
  ok?: boolean;
  profile?: Profile | null;
  error?: string;
  message?: string;
};

type EntryBoard = {
  key: string;
  title: string;
  description: string;
  world_key: string | null;
  topic_key: string | null;
  is_sensitive: boolean;
  monthly_price: number;
};

async function readJsonOrThrow(r: Response, label: string) {
  const raw = await r.text();
  let j: any = null;

  try {
    j = raw ? JSON.parse(raw) : null;
  } catch {
    console.error(`[${label}] non-json response`, {
      status: r.status,
      contentType: r.headers.get("content-type"),
      rawPreview: raw.slice(0, 300),
    });
    throw new Error("non_json_response");
  }

  if (!r.ok) {
    const err = j?.error ?? `${label}_failed_${r.status}`;
    const detail = j?.detail ? ` / ${j.detail}` : "";

    if (err === "billing_customer_missing") {
      console.warn(`[${label}] billing_customer_missing (non-fatal)`);
      return { ok: false, error: "billing_customer_missing" };
    }

    if (err === "manual_override_enabled") {
      console.warn(`[${label}] manual_override_enabled`);
      return j;
    }

    console.error(`[${label}] api error`, j);
    throw new Error(`${err}${detail}`);
  }

  return j;
}


function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeTrim(v: unknown) {
  return String(v ?? "").trim();
}

function getJstNowMinutes() {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");

  return hour * 60 + minute;
}

function isNowWithinWindow(start?: string, end?: string) {
  if (!start || !end) return true;

  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);

  const nowMin = getJstNowMinutes();
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;

  if (startMin <= endMin) {
    return nowMin >= startMin && nowMin <= endMin;
  }

  return nowMin >= startMin || nowMin <= endMin;
}

export default function SelectClient() {
  console.log("🔥 NEW VERSION LOADED");

  const searchParams = useSearchParams();
  const dev = (searchParams.get("dev") ?? "").trim();
  const devQuery = dev ? `dev=${encodeURIComponent(dev)}` : "";

  const withDev = (path: string) => {
    if (!devQuery) return path;
    return `${path}${path.includes("?") ? "&" : "?"}${devQuery}`;
  };

  const [deviceId, setDeviceId] = useState("");
  const { refresh: refreshCurrentClass } = useCurrentClass(deviceId);

  const [worlds, setWorlds] = useState<World[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [, setClasses] = useState<ClassRow[]>([]);

  const [prefs, setPrefs] = useState<MatchPrefs>(AGE_FILTER_OFF_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const [wFilter, setWFilter] = useState<string>("all");
  const [tFilter, setTFilter] = useState<string>("all");

  const [ent, setEnt] = useState<Entitlements | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const [showNarrow, setShowNarrow] = useState(false);
  const [joinLimitMessage, setJoinLimitMessage] = useState("");

  const [joinWindowOpen, setJoinWindowOpen] = useState(true);
  const [joinWindowText, setJoinWindowText] = useState("");

  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoadError, setProfileLoadError] = useState(false);
  const [deviceIdInvalid, setDeviceIdInvalid] = useState(false);
  const [entryFailure, setEntryFailure] = useState<{
    code: string;
    message: string;
  } | null>(null);
  const [joinedClassesLoading, setJoinedClassesLoading] = useState(false);
  const [joinedClassCount, setJoinedClassCount] = useState(0);
  const lastJoinBoardRef = useRef<EntryBoard | null>(null);

  async function reloadCatalog() {
    try {
      const r = await fetch("/api/class/list", { cache: "no-store" });
      const j = await readJsonOrThrow(r, "class_list");
      setWorlds(j.worlds ?? []);
      setClasses(j.classes ?? []);

      const tr = await fetch("/api/topics", { cache: "no-store" });
      const tj = await readJsonOrThrow(tr, "topics");
      setTopics(tj.topics ?? []);
    } catch (e) {
      console.error(e);
      setWorlds([]);
      setClasses([]);
      setTopics([]);
    }
  }

  async function reloadJoinWindow() {
  try {
    const r = await fetch("/api/admission/status", {
      cache: "no-store",
    });

    const j = await r.json().catch(() => null);

    console.log("[class/select] admission status =", j);

    if (!r.ok || !j?.ok) {
      setJoinWindowOpen(true);
      setJoinWindowText("");
      return;
    }

    setJoinWindowOpen(Boolean(j.open));
    setJoinWindowText(String(j.text ?? ""));
  } catch (e) {
    console.error("[class/select] admission status load failed", e);
    setJoinWindowOpen(true);
    setJoinWindowText("");
  }
}

  async function postSelectPresence(id: string) {
    if (!id) return;
    if (typeof window === "undefined") return;

    const path = window.location.pathname;

    if (path.includes("/room") || path.includes("/call")) {
      return;
    }

    try {
      await fetch("/api/class/presence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          device_id: id,
          screen: "home",
        }),
        cache: "no-store",
      });
    } catch (e) {
      console.warn("[class/select] presence skipped", e);
    }
  }

  async function fetchProfile(id: string) {
    try {
      const r = await fetch(`/api/profile?device_id=${encodeURIComponent(id)}`, {
        method: "GET",
        cache: "no-store",
      });

      const rawText = await r.text().catch(() => "");
      let raw: ProfileApiResponse | null = null;

      try {
        raw = rawText ? (JSON.parse(rawText) as ProfileApiResponse) : null;
      } catch {
        raw = null;
      }

      if (!r.ok || !raw?.ok) {
        console.warn("[class/select] profile fetch not ok", {
          requestedDeviceId: id,
          status: r.status,
          rawText,
          raw,
          dev,
        });
        if (r.status >= 500) {
          setProfileLoadError(true);
          setHasProfile(null);
          setProfile(null);
          logProfileExists(id, false);
          return null;
        }
        setProfileLoadError(false);
        setHasProfile(false);
        setProfile(null);
        logProfileExists(id, false);
        return null;
      }

      setProfileLoadError(false);
      const nextProfile: Profile | null = raw?.profile ?? null;

      const exists = isUserProfileComplete(nextProfile);

      setHasProfile(exists);
      setProfile(nextProfile);
      logProfileExists(id, exists);

      console.log("[class/select] profile =", {
        requestedDeviceId: id,
        returnedDeviceId: nextProfile?.device_id ?? null,
        displayName: nextProfile?.display_name ?? null,
        hasProfile: exists,
        dev,
      });

      return nextProfile;
    } catch (e) {
      console.error("[class/select] profile fetch failed", e);
      setProfileLoadError(true);
      setHasProfile(null);
      setProfile(null);
      logProfileExists(id, false);
      return null;
    }
  }

  function handleResetDeviceAndReload() {
    if (!window.confirm(DEVICE_RESET_CONFIRM_MESSAGE)) return;
    resetClassmateDeviceState();
    window.location.href = withDev("/");
  }

  function showEntryFailure(code: string, message?: string) {
    const resolved = message?.trim() || resolveMatchJoinUserMessage(code);
    setEntryFailure({ code, message: resolved });
    logMatchJoinClientFailed(deviceId, code, resolved);
  }

  async function fetchEntitlements(id: string) {
    const er = await fetch("/api/user/entitlements", {
      method: "GET",
      headers: { "x-device-id": id },
      cache: "no-store",
    });
    const ej = await readJsonOrThrow(er, "entitlements");

    const topicPlan =
      typeof ej.topic_plan === "number"
        ? ej.topic_plan
        : Boolean(ej.theme_pass)
          ? 1200
          : 0;

    const next: Entitlements = {
      plan: ej.plan ?? "free",
      class_slots: ej.class_slots ?? 1,
      can_create_classes: ej.can_create_classes ?? false,
      theme_pass: Boolean(ej.theme_pass),
      topic_plan: topicPlan,
    };

    console.log("[class/select] entitlements =", {
      deviceId: id,
      entitlements: next,
    });

    setEnt(next);
    return next;
  }

  async function syncBilling(id: string) {
    const sr = await fetch("/api/billing/sync", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-device-id": id,
      },
      body: JSON.stringify({ deviceId: id }),
      cache: "no-store",
    });

    try {
      const sj = await readJsonOrThrow(sr, "billing_sync");
      if (sj?.error === "billing_customer_missing") return sj;
      if (sj?.reason === "manual_override_enabled") return sj;

      console.log("[class/select] sync ok", sj);
      return sj;
    } catch (e) {
      console.error("[class/select] sync failed", e);
      return null;
    }
  }

  async function refreshJoinedClassCount(id: string) {
    const normalized = String(id ?? "").trim();
    if (!normalized) {
      setJoinedClassCount(0);
      setJoinedClassesLoading(false);
      return;
    }

    setJoinedClassesLoading(true);
    try {
      const r = await fetch(
        `/api/class/mine?deviceId=${encodeURIComponent(normalized)}&lite=1`,
        { cache: "no-store" }
      );
      const j = await r.json().catch(() => null);
      if (r.ok && j?.ok && Array.isArray(j.classes)) {
        setJoinedClassCount(j.classes.length);
      } else {
        setJoinedClassCount(0);
      }
    } catch {
      setJoinedClassCount(0);
    } finally {
      setJoinedClassesLoading(false);
    }
  }

  async function finalizeFromSession(id: string, sessionId: string) {
    const fr = await fetch("/api/billing/finalize", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-device-id": id,
      },
      body: JSON.stringify({ session_id: sessionId, deviceId: id }),
      cache: "no-store",
    });

    const fj = await readJsonOrThrow(fr, "billing_finalize");
    console.log("[class/select] finalize ok", fj);
    return fj;
  }

  useEffect(() => {
    let alive = true;

    const init = async () => {
      const id = getDeviceId();

      console.log("[class/select] init start", {
        dev,
        deviceId: id,
        href: typeof window !== "undefined" ? window.location.href : "",
      });

      if (!alive) return;

      setLoading(true);
      setBusy(false);
      setJoinLimitMessage("");
      setEntryFailure(null);
      setProfileLoadError(false);
      setDeviceId(id);
      const deviceValid = isJoinAllowedDeviceId(id);
      setDeviceIdInvalid(isLegacyStoredDeviceId(id));
      if (!deviceValid) {
        logDeviceEnsureFailed(id, "invalid_uuid_format");
      } else {
        logDeviceEnsureStart(id);
        logDeviceEnsureSuccess(id, "select_init");
      }
      setHasProfile(null);
      setProfile(null);
      setEnt(null);
      setPrefs(AGE_FILTER_OFF_PREFS);
      setPrefsLoaded(false);
      setWorlds([]);
      setTopics([]);
      setClasses([]);

      try {
        const settingsRes = await fetch("/api/settings", { cache: "no-store" });
        if (settingsRes.ok) {
          await settingsRes.json().catch(() => null);
        }

        const sp = new URLSearchParams(window.location.search);
        const paid = sp.get("paid");
        const sessionId = sp.get("session_id");

        console.log("[class/select] params", {
          paid,
          sessionId,
          deviceId: id,
          dev,
        });

        await fetchProfile(id);
        if (!alive) return;

        void refreshCurrentClass();
        void refreshJoinedClassCount(id);

        await reloadJoinWindow();
        if (!alive) return;

        // 【修正】400エラーと誤退出扱いを防ぐため、Home画面でのpresence送信を停止
        // void postSelectPresence(id);

        setLoading(false);

        void fetchEntitlements(id);
        if (!alive) return;

        if (paid === "1" && sessionId) {
          try {
            await finalizeFromSession(id, sessionId);
            if (!alive) return;

            const firstSync = await syncBilling(id);
            if (!alive) return;

            await fetchEntitlements(id);
            if (!alive) return;

            await sleep(1200);
            if (!alive) return;

            const secondSync = await syncBilling(id);
            if (!alive) return;

            await fetchEntitlements(id);
            if (!alive) return;

            console.log("[class/select] finalize sync results =", {
              firstSync,
              secondSync,
            });

            sp.delete("paid");
            sp.delete("session_id");
            const qs = sp.toString();
            const newUrl = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
            window.history.replaceState({}, "", newUrl);
          } catch (e) {
            console.error("[class/select] finalize flow failed", e);

            const syncResult = await syncBilling(id);
            if (!alive) return;

            await sleep(800);
            if (!alive) return;

            await fetchEntitlements(id);
            if (!alive) return;

            console.log("[class/select] finalize fallback syncResult =", syncResult);
          }
        } else {
          const syncResult = await syncBilling(id);
          if (!alive) return;

          await fetchEntitlements(id);
          if (!alive) return;

          console.log("[class/select] syncResult =", syncResult);
        }

        void reloadCatalog();
        void reloadJoinWindow();
      } catch (e: any) {
        console.error(e);
        if (alive) {
          alert(e?.message ?? "load_failed");
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    };

    void init();

    return () => {
      alive = false;
    };
  }, [dev]);

  const slots = ent?.class_slots ?? 1;
  const topicPlan = ent?.topic_plan ?? (ent?.theme_pass ? 1200 : 0);

  const boards = useMemo<EntryBoard[]>(() => {
    const maxA = Math.max(prefs.min_age, prefs.max_age);
    const result: EntryBoard[] = [];

    if ((wFilter === "all" || wFilter === "default") && tFilter === "all") {
      result.push({
        key: "free",
        title: "フリー",
        description: "",
        world_key: "default",
        topic_key: null,
        is_sensitive: false,
        monthly_price: 0,
      });
    }

    for (const t of topics) {
      if (t.is_sensitive && maxA < 18) continue;
      if (wFilter !== "all" && wFilter !== "default") continue;
      if (tFilter !== "all" && t.topic_key !== tFilter) continue;

      result.push({
        key: t.topic_key,
        title: t.title,
        description: t.description || "",
        world_key: "default",
        topic_key: t.topic_key,
        is_sensitive: t.is_sensitive,
        monthly_price:
          typeof t.monthly_price === "number"
            ? t.monthly_price
            : t.is_premium
              ? 1200
              : 0,
      });
    }

    return result.sort((a, b) => {
      if (a.monthly_price !== b.monthly_price) {
        return a.monthly_price - b.monthly_price;
      }
      return a.title.localeCompare(b.title);
    });
  }, [topics, prefs, wFilter, tFilter]);

  function hasBoardAccess(b: EntryBoard): boolean {
    return b.monthly_price <= topicPlan;
  }

  function setSlotsLimitUi(classSlots?: number) {
    setJoinLimitMessage(
      `クラス参加上限に達しています。現在のプランでは最大 ${
        classSlots ?? slots
      } クラスまで参加できます。不要なクラスを抜けるか、プランを変更してください。`
    );
  }

  function goProfileIfNeeded(error?: string) {
    if (error && error !== "profile_required") return false;

    const ok = window.confirm(
      "クラスに参加するにはプロフィール登録が必要です。\nプロフィール登録ページへ移動しますか？"
    );

    if (ok) {
      window.location.href = withDev(buildProfileEditPath("/class/select"));
    }

    return true;
  }

  async function joinMatchedBoard(b: EntryBoard, forcedClassId?: string) {
    console.log("[select] clicked board =", b, "forcedClassId =", forcedClassId);
    lastJoinBoardRef.current = b;
    setEntryFailure(null);

    if (!deviceId) {
      alert("deviceId の取得中です。数秒後にもう一度押してください。");
      return;
    }

    if (!isJoinAllowedDeviceId(deviceId)) {
      showEntryFailure(
        "invalid_deviceId",
        resolveMatchJoinUserMessage("invalid_deviceId")
      );
      return;
    }

    if (hasProfile === false) {
      goProfileIfNeeded();
      return;
    }

    if (hasProfile === null && profileLoadError) {
      showEntryFailure(
        "profile_load_failed",
        "プロフィール情報の取得に失敗しました。もう一度試すか、端末情報をリセットしてください。"
      );
      return;
    }

    if (!prefsLoaded) {
      alert("年齢設定を読み込み中です。数秒後にもう一度お試しください。");
      return;
    }

    setBusy(true);
    setJoinLimitMessage("");

    try {
      if (!hasBoardAccess(b)) {
        alert(
          `このテーマは ${tierName(b.monthly_price)}（¥${b.monthly_price}/月）以上が必要です`
        );
        return;
      }

      const displayName = safeTrim(profile?.display_name);

      if (!displayName) {
        goProfileIfNeeded("profile_required");
        return;
      }

      const submitPrefs = matchPrefsForSubmit(prefs);
      const finalMinAge = submitPrefs.min_age;
      const finalMaxAge = submitPrefs.max_age;

      console.log(
        `[match-join] click device=${String(deviceId).slice(-6)} topic=${b.topic_key} ` +
          `prefs=${finalMinAge}-${finalMaxAge} world=${b.world_key ?? "default"}`
      );

      const matchBody = buildMatchJoinRequestBody({
        deviceId,
        topicKey: b.topic_key,
        worldKey: b.world_key ?? "default",
        capacity: 5,
        minAge: finalMinAge,
        maxAge: finalMaxAge,
        openJoinedClassId: forcedClassId ?? null,
      });

      const clientRequestId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `select-${Date.now()}`;

      console.log(
        `[match-join] request-start requestId=${clientRequestId.slice(0, 8)} device=${String(deviceId).slice(-6)}`
      );

      logMatchJoinClientStart(deviceId);

      const matchRes = await fetch("/api/class/match-join-v2", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(matchBody),
        cache: "no-store",
      });

      const matchRaw = await matchRes.text();
      let matchJson: any = {};
      try {
        matchJson = matchRaw ? JSON.parse(matchRaw) : {};
      } catch {
        throw new Error("non_json_response");
      }

      console.log(
        `[match-join] response class=${String(matchJson?.classId ?? "").slice(-6)} ` +
          `session=${String(matchJson?.sessionId ?? "").slice(-6)} ` +
          `createdNew=${Boolean(matchJson?.createdNewClass)} joinedExisting=${Boolean(matchJson?.reused) || Boolean(matchJson?.raceMerged)} ` +
          `requestId=${String(matchJson?.requestId ?? clientRequestId).slice(0, 8)}`
      );

      if (!matchRes.ok || !matchJson?.ok || matchJson?.joinStateOk === false) {
        const errorCode = String(
          matchJson?.error ?? (matchRes.ok ? "join_state_failed" : `http_${matchRes.status}`)
        );
        if (errorCode === "profile_required") {
          goProfileIfNeeded(errorCode);
          return;
        }

        if (errorCode === "class_slots_limit") {
          setSlotsLimitUi(matchJson?.classSlots);
          logMatchJoinClientFailed(deviceId, errorCode);
          return;
        }

        if (
          errorCode === "admission_closed" ||
          errorCode === "match_deadline_passed"
        ) {
          alert(
            matchJson?.message ??
              "現在は入校受付時間外です。受付時間になったら、もう一度お試しください。"
          );
          logMatchJoinClientFailed(deviceId, errorCode, matchJson?.message);
          void reloadJoinWindow();
          return;
        }

        if (errorCode === "recruitment_closed") {
          alert(matchJson?.message ?? "このクラスは現在募集していません。");
          logMatchJoinClientFailed(deviceId, errorCode, matchJson?.message);
          return;
        }

        if (errorCode === "gender_restricted_topic") {
          alert(matchJson?.message ?? GENDER_RESTRICTED_TOPIC_MESSAGE);
          logMatchJoinClientFailed(deviceId, errorCode);
          return;
        }

        showEntryFailure(
          errorCode,
          resolveMatchJoinUserMessage(errorCode, matchJson?.message)
        );
        return;
      }

      const classId = safeTrim(matchJson?.classId);
      const sessionId = safeTrim(matchJson?.sessionId);
      const sessionStatus = safeTrim(matchJson?.sessionStatus);
      const sessionCreatedAt = safeTrim(matchJson?.sessionCreatedAt);
      const recruitmentSessionTtlUnlimited =
        matchJson?.recruitmentSessionTtlUnlimited === true;
      const recruitmentSessionTtlMinutes = recruitmentSessionTtlUnlimited
        ? null
        : Number(matchJson?.recruitmentSessionTtlMinutes ?? 5);

      console.log("[select] match-join resolved", {
        openJoinedClass: matchBody.openJoinedClass ?? false,
        forcedClassId: matchBody.classId ?? null,
        classId,
        sessionId,
        sessionStatus,
        sessionCreatedAt,
        recruitmentSessionTtlMinutes,
      });

      if (sessionStatus === "active" && !matchBody.openJoinedClass) {
        alert("このクラスは現在募集していません。");
        return;
      }

      if (
        !matchBody.openJoinedClass &&
        !isSessionEligibleForNormalJoin({
          sessionStatus,
          sessionCreatedAt,
          recruitmentSessionTtlMinutes,
        })
      ) {
        alert("このクラスは現在募集していません。");
        return;
      }

      if (!classId || !sessionId) {
        showEntryFailure("match_join_missing_ids");
        return;
      }

      logMatchJoinClientSuccess(deviceId, classId, sessionId);

      if (!matchBody.openJoinedClass) {
        const autoCallDeviceId = String(deviceId || getDeviceId() || "").trim();
        if (autoCallDeviceId) {
          markAutoCallOnce(sessionId, autoCallDeviceId);
        }
      }

      const roomUrl =
        `/room?autojoin=1&classId=${encodeURIComponent(classId)}` +
        `&sessionId=${encodeURIComponent(sessionId)}` +
        (devQuery ? `&${devQuery}` : "");

      pushRecentClass(
        {
          id: classId,
          title: b.title,
          url: roomUrl,
        },
        20
      );

      window.location.href = roomUrl;
    } catch (e: any) {
      console.error(e);
      showEntryFailure(
        "enter_board_failed",
        resolveMatchJoinUserMessage("server_error")
      );
    } finally {
      setBusy(false);
    }
  }

  async function enterQuickFreeTheme() {
    const freeBoard: EntryBoard = {
      key: "free",
      title: "フリー",
      description: "",
      world_key: "default",
      topic_key: null,
      is_sensitive: false,
      monthly_price: 0,
    };

    await joinMatchedBoard(freeBoard);
  }

  function BoardCard({ b }: { b: EntryBoard }) {
    const locked = !hasBoardAccess(b);
    const profileMissing = hasProfile === false;
    const admissionClosed = !joinWindowOpen;
    const prefsNotReady = !prefsLoaded;
    const joinDisabled =
      busy || !deviceId || profileMissing || admissionClosed || prefsNotReady;

    return (
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 16,
          padding: 14,
          background: "#fff",
          color: "#111",
          opacity: locked ? 0.7 : 1,
          filter: locked ? "grayscale(0.35)" : "none",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "baseline",
          }}
        >
          <strong style={{ fontSize: 15 }}>{b.title}</strong>
          <span style={{ fontSize: 12, opacity: 0.9 }}>
            {profileMissing && "🧑未登録 "}
            {locked ? "🔒" : "🔓"} {b.is_sensitive ? "🔞" : "🟢"}
          </span>
        </div>

        {b.description ? (
          <p
            style={{
              marginTop: 14,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              wordBreak: "break-word",
              color: "#222",
              lineHeight: 1.5,
            }}
          >
            {b.description}
          </p>
        ) : null}

        <button
          onClick={() => void joinMatchedBoard(b)}
          disabled={joinDisabled}
          style={{
            marginTop: 14,
            width: "100%",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ccc",
            background:
              profileMissing || admissionClosed
                ? "#e5e5e5"
                : locked
                  ? "#f3f3f3"
                  : "#111",
            color:
              profileMissing || admissionClosed
                ? "#666"
                : locked
                  ? "#111"
                  : "#fff",
            fontWeight: 900,
            cursor: joinDisabled ? "not-allowed" : "pointer",
          }}
        >
          {profileMissing
            ? "プロフィール登録が必要"
            : admissionClosed
              ? "入校受付時間外"
              : locked
                ? `参加（要：${tierName(b.monthly_price)}以上）`
                : "入る"}
        </button>
      </div>
    );
  }

  const debugProfileDeviceId = profile?.device_id ?? "-";
  const debugDisplayName = profile?.display_name ?? "-";
  const showJoinedClassesCard =
    joinedClassesLoading || joinedClassCount > 0;

  return (
    <main style={{ padding: "28px 20px", maxWidth: 960, margin: "0 auto", color: "#111" }}>
      <style>{HOME_DASHBOARD_LAYOUT_CSS}</style>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 900,
              color: "#111",
              letterSpacing: 0.5,
            }}
          >
            classmate
          </h1>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <Link
            href={withDev(buildProfileEditPath("/class/select"))}
            style={{
              padding: "8px 12px",
              borderRadius: 12,
              border: hasProfile ? "1px solid #e5e7eb" : "1px solid #111827",
              background: hasProfile ? "#fff" : "#111827",
              fontWeight: 800,
              fontSize: 13,
              color: hasProfile ? "#374151" : "#fff",
              textDecoration: "none",
            }}
          >
            {hasProfile ? "プロフィール編集" : "プロフィール登録"}
          </Link>

          <Link
            href={withDev("/premium")}
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              border: "1px solid #ccc",
              background: "#fff",
              fontWeight: 900,
              color: "#111",
              textDecoration: "none",
            }}
          >
            プランを見る
          </Link>

          <Link
            href={withDev("/billing")}
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              border: "1px solid #ccc",
              background: "#fff",
              fontWeight: 900,
              color: "#111",
              textDecoration: "none",
            }}
          >
            お支払い・解約
          </Link>

          {isDevFeatureEnabled() && (
            <Link
              href={withDev("/dev/console")}
              style={{
                padding: "8px 10px",
                borderRadius: 12,
                border: "1px solid #f59e0b",
                background: "#fffbeb",
                fontWeight: 900,
                color: "#92400e",
                textDecoration: "none",
              }}
            >
              🧪 開発コンソール
            </Link>
          )}
        </div>
      </header>

      {isDevFeatureEnabled() && (
        <section
          style={{
            marginTop: 12,
            border: "1px solid #fcd34d",
            background: "#fffbeb",
            color: "#92400e",
            borderRadius: 14,
            padding: 12,
            fontSize: 12,
            lineHeight: 1.7,
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 4 }}>DEV STATUS</div>
          <div>dev: {dev || "-"}</div>
          <div>deviceId: {deviceId || "-"}</div>
          <div>profile.device_id: {debugProfileDeviceId}</div>
          <div>display_name: {debugDisplayName}</div>
          <div>prefsLoaded: {String(prefsLoaded)}</div>
          <div>
            prefs:{" "}
            {isAgeFilterOff(prefs)
              ? "OFF"
              : `${Math.min(prefs.min_age, prefs.max_age)}〜${Math.max(prefs.min_age, prefs.max_age)}`}
          </div>
        </section>
      )}

      {hasProfile === false ? (
        <section style={{ ...DASH_CARD, marginTop: 20, borderColor: "#fde68a" }}>
          <div style={{ fontWeight: 900, fontSize: 15, color: "#92400e" }}>
            プロフィール登録が必要です
          </div>
          <Link
            href={withDev(buildProfileEditPath("/class/select"))}
            style={{
              ...PRIMARY_BTN,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 12,
              textDecoration: "none",
            }}
          >
            プロフィール登録
          </Link>
        </section>
      ) : null}

      {deviceIdInvalid ? (
        <EntryFailurePanel
          title="端末情報を確認してください"
          message={resolveMatchJoinUserMessage("invalid_deviceId")}
          errorCode="invalid_deviceId"
          onResetDevice={handleResetDeviceAndReload}
        />
      ) : null}

      {entryFailure ? (
        <EntryFailurePanel
          message={entryFailure.message}
          errorCode={entryFailure.code}
          onRetry={() => {
            const board = lastJoinBoardRef.current;
            if (board) {
              void joinMatchedBoard(board);
              return;
            }
            setEntryFailure(null);
            void reloadCatalog();
          }}
          onResetDevice={handleResetDeviceAndReload}
        />
      ) : null}

      {joinLimitMessage ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
            fontWeight: 800,
            lineHeight: 1.6,
          }}
        >
          {joinLimitMessage}
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link
              href={withDev("/")}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #fca5a5",
                background: "#fff",
                color: "#991b1b",
                textDecoration: "none",
                fontWeight: 900,
              }}
            >
              所属クラス一覧へ
            </Link>
            <Link
              href={withDev("/premium")}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #fca5a5",
                background: "#fff",
                color: "#991b1b",
                textDecoration: "none",
                fontWeight: 900,
              }}
            >
              プランを見る
            </Link>
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 20, display: "grid", gap: 16, gridTemplateColumns: "1fr" }}>
        {showJoinedClassesCard ? (
          <ReturnClassCard
            className="home-dash-return"
            loading={joinedClassesLoading && joinedClassCount === 0}
            listHref={withDev("/")}
            listLabel="ホームで選ぶ"
          />
        ) : null}

        <DashboardStatusBar
          slots={slots}
          planLabel={tierName(topicPlan)}
          joinWindowOpen={joinWindowOpen}
          joinWindowText={joinWindowText}
          loading={loading}
          onReload={() => {
            void reloadCatalog();
            void refreshCurrentClass();
            if (deviceId) {
              void refreshJoinedClassCount(deviceId);
            }
          }}
        />

        <div className="home-dash-bottom">
          <JoinNewCard
            className="home-dash-join"
            quickJoinBusy={busy}
            quickJoinDisabled={
              !deviceId || hasProfile === false || !joinWindowOpen || !prefsLoaded
            }
            pickPlaceLabel={showNarrow ? "閉じる" : "入る場所を選ぶ"}
            onQuickJoin={() => void enterQuickFreeTheme()}
            onPickPlace={() => setShowNarrow((v) => !v)}
          />

          <AgeFilterCard
            className="home-dash-age"
            deviceId={deviceId}
            hasProfile={hasProfile}
            disabled={loading}
            onPrefsChange={setPrefs}
            onPrefsLoadedChange={setPrefsLoaded}
            onProfileRequired={() => {
              goProfileIfNeeded("profile_required");
            }}
          />
        </div>
      </div>

      {showNarrow && (
        <>
          <section
            style={{
              marginTop: 12,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <select
              value={wFilter}
              onChange={(e) => setWFilter(e.target.value)}
              style={{ padding: 10, borderRadius: 10 }}
            >
              <option value="all">世界観: すべて</option>
              {worlds.map((w) => (
                <option key={w.world_key} value={w.world_key}>
                  {w.title} {w.is_sensitive ? "🔞" : ""}
                </option>
              ))}
            </select>

            <select
              value={tFilter}
              onChange={(e) => setTFilter(e.target.value)}
              style={{ padding: 10, borderRadius: 10 }}
            >
              <option value="all">テーマ: すべて</option>
              {topics.map((t) => (
                <option key={t.topic_key} value={t.topic_key}>
                  {t.title} {t.is_sensitive ? "🔞" : ""}{" "}
                  {t.monthly_price ? `（要:${tierName(t.monthly_price)}以上）` : ""}
                </option>
              ))}
            </select>
          </section>

          <section style={{ marginTop: 14 }}>
            <h2 style={{ margin: "10px 0", fontSize: 16, fontWeight: 900 }}>テーマ</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 12,
              }}
            >
              {boards.map((b) => (
                <BoardCard key={b.key} b={b} />
              ))}
            </div>

            {boards.length === 0 && !loading ? (
              <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
                条件に合うテーマがありません
              </div>
            ) : null}
          </section>
        </>
      )}

      <div style={{ height: 24 }} />
      <DevModeSwitcher />
    </main>
  );
}