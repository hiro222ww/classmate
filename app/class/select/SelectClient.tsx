"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  buildMatchedRoomPath,
  prepareMatchedCallEntry,
  resolveMatchJoinSessionIds,
} from "@/lib/enterMatchedCallClient";
import type { MatchEntryMode } from "@/lib/matchJoinEntryMode";
import { getDeviceId } from "@/lib/device";
import { pushRecentClass } from "@/lib/recentClasses";
import { DevModeSwitcher } from "@/components/DevModeSwitcher";
import { isDevFeatureEnabled } from "@/lib/devMode";
import { buildMatchJoinRequestBody } from "@/lib/matchJoinRequest";
import {
  buildThemeSelectPath,
  JOIN_MODE_QUERY_KEY,
  parseJoinMode,
  type JoinMode,
} from "@/lib/joinMode";
import { isSessionEligibleForNormalJoin } from "@/lib/recruitment";
import { GENDER_RESTRICTED_TOPIC_MESSAGE } from "@/lib/genderRestriction";
import { hasMinimumProfile } from "@/lib/profileClient";
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
import { buildDeviceAuthHeaders } from "@/lib/fetchCurrentClass";
import { bootstrapAuthSession } from "@/lib/authClient";
import { EntryFailurePanel } from "@/components/EntryFailurePanel";
import { resolveShellDashboardPath, isAppShellContext } from "@/lib/appShellContext";
import { AgeFilterCard } from "@/components/dashboard/AgeFilterCard";
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
import { HomeBrandVisual } from "@/components/brand/HomeBrandVisual";
import { useBillingCopy } from "@/hooks/useBillingCopy";
import { useDashboardAccountStatus } from "@/hooks/useDashboardAccountStatus";
import { useWebPushNotifications } from "@/hooks/useWebPushNotifications";
import HomeMenuSheet from "@/components/HomeMenuSheet";
import { IosWebPushInstallGuide } from "@/components/IosWebPushInstallGuide";
import {
  buildShellAwareLoginUrl,
  buildShellAwareSettingsUrl,
} from "@/lib/appShellNavigation";

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
  badge_label?: string | null;
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
  /** Admin/custom badge when present; paid teasers fall back to 準備中. */
  badge_label?: string | null;
};

/** Display-only grouping for existing topics (no dummy themes). */
type ThemeCategoryId =
  | "chat"
  | "hobby"
  | "game"
  | "travel"
  | "school"
  | "night"
  | "other";

/**
 * Paid / unreleased themes are shown as non-interactive teasers.
 * Join / purchase / billing stay disabled — data is display-only.
 */
const SHOW_PAID_THEMES_AS_TEASER = true;
const PAID_THEME_TEASER_LABEL = "準備中";

const THEME_CATEGORIES: {
  id: ThemeCategoryId;
  label: string;
  tint: string;
  border: string;
}[] = [
  {
    id: "chat",
    label: "雑談・交流",
    tint: "linear-gradient(180deg, rgba(236,253,245,0.9), rgba(255,255,255,0.95))",
    border: "rgba(16, 185, 129, 0.22)",
  },
  {
    id: "hobby",
    label: "趣味",
    tint: "linear-gradient(180deg, rgba(255,247,237,0.95), rgba(255,255,255,0.95))",
    border: "rgba(251, 146, 60, 0.22)",
  },
  {
    id: "game",
    label: "ゲーム",
    tint: "linear-gradient(180deg, rgba(245,243,255,0.95), rgba(255,255,255,0.95))",
    border: "rgba(167, 139, 250, 0.25)",
  },
  {
    id: "travel",
    label: "旅行",
    tint: "linear-gradient(180deg, rgba(240,249,255,0.95), rgba(255,255,255,0.95))",
    border: "rgba(56, 189, 248, 0.28)",
  },
  {
    id: "school",
    label: "学校・仕事",
    tint: "linear-gradient(180deg, rgba(239,246,255,0.95), rgba(255,255,255,0.95))",
    border: "rgba(96, 165, 250, 0.28)",
  },
  {
    id: "night",
    label: "夜・まったり",
    tint: "linear-gradient(180deg, rgba(238,242,255,0.95), rgba(255,255,255,0.95))",
    border: "rgba(129, 140, 248, 0.28)",
  },
  {
    id: "other",
    label: "その他のテーマ",
    tint: "linear-gradient(180deg, rgba(248,250,252,0.95), rgba(255,255,255,0.95))",
    border: "rgba(148, 163, 184, 0.3)",
  },
];

const FREE_TINT =
  "linear-gradient(180deg, rgba(236,253,245,0.95) 0%, rgba(239,246,255,0.9) 100%)";

function categorizeTheme(title: string, description: string): ThemeCategoryId {
  const s = `${title} ${description}`.toLowerCase();
  if (/ゲーム|game|esports|eスポーツ/.test(s)) return "game";
  if (/旅行|travel|旅|観光/.test(s)) return "travel";
  if (/夜|まったり|深夜|おやすみ|night/.test(s)) return "night";
  if (
    /男子校|女子校|学校|部活|スポーツ|仕事|職業|sports|work|identity|属性/.test(
      s
    )
  ) {
    return "school";
  }
  if (/趣味|hobby|創作|音楽|映画|アニメ|イラスト|漫画/.test(s)) return "hobby";
  if (/雑談|交流|フリー|talk|chat|おしゃべり/.test(s)) return "chat";
  return "other";
}

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
  const joinMode: JoinMode = parseJoinMode(searchParams.get(JOIN_MODE_QUERY_KEY));
  const selectSelfPath = buildThemeSelectPath(joinMode, { dev: dev || null });

  const withDev = (path: string) => {
    if (!devQuery) return path;
    return `${path}${path.includes("?") ? "&" : "?"}${devQuery}`;
  };

  const [deviceId, setDeviceId] = useState("");
  const {
    adminAuthenticated,
    opsTestFlags,
    loggedIn,
    accountLabel,
  } = useDashboardAccountStatus(deviceId);

  const [menuOpen, setMenuOpen] = useState(false);
  const opsTestActive =
    adminAuthenticated &&
    (opsTestFlags.ignoreAdmission ||
      opsTestFlags.ignoreAge ||
      opsTestFlags.allowMinorProfile ||
      opsTestFlags.ignoreRecruitment);
  const {
    enabled: notificationsEnabled,
    toggle: toggleNotifications,
    busy: notificationsBusy,
    feedback: _notificationsFeedback,
    iosInstallGuideOpen,
    dismissIosInstallGuide,
  } = useWebPushNotifications(deviceId, "select");
  const { refresh: refreshCurrentClass } = useCurrentClass(deviceId);

  const [worlds, setWorlds] = useState<World[]>([]);
  void worlds;
  const [topics, setTopics] = useState<Topic[]>([]);
  const [, setClasses] = useState<ClassRow[]>([]);

  const [prefs, setPrefs] = useState<MatchPrefs>(AGE_FILTER_OFF_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const [ent, setEnt] = useState<Entitlements | null>(null);
  const { themeBillingEnabled, slotBillingEnabled } = useBillingCopy();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

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
        headers: await buildDeviceAuthHeaders(id),
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

      const exists = hasMinimumProfile(nextProfile);

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
    window.location.href = withDev(resolveShellDashboardPath());
  }

  function showEntryFailure(code: string, message?: string) {
    const resolved = message?.trim() || resolveMatchJoinUserMessage(code);
    setEntryFailure({ code, message: resolved });
    logMatchJoinClientFailed(deviceId, code, resolved);
  }

  async function fetchEntitlements(id: string) {
    const er = await fetch("/api/user/entitlements", {
      method: "GET",
      headers: await buildDeviceAuthHeaders(id),
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
        ...(await buildDeviceAuthHeaders(id)),
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
        {
          cache: "no-store",
          headers: await buildDeviceAuthHeaders(normalized),
        }
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
        ...(await buildDeviceAuthHeaders(id)),
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

        if (deviceValid) {
          await bootstrapAuthSession(id);
        }

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

    result.push({
      key: "free",
      title: "フリー",
      description: "テーマを決めずに、気軽に同年代と話せるクラスです。",
      world_key: "default",
      topic_key: null,
      is_sensitive: false,
      monthly_price: 0,
    });

    for (const t of topics) {
      if (t.is_sensitive && maxA < 18) continue;

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
        badge_label: t.badge_label ?? null,
      });
    }

    return result.sort((a, b) => {
      if (a.monthly_price !== b.monthly_price) {
        return a.monthly_price - b.monthly_price;
      }
      return a.title.localeCompare(b.title);
    });
  }, [topics, prefs]);

  const freeBoards = useMemo(
    () => boards.filter((b) => b.monthly_price <= 0),
    [boards]
  );

  const themeGroups = useMemo(() => {
    const paid = boards.filter((b) => b.monthly_price > 0);
    return THEME_CATEGORIES.map((cat) => ({
      ...cat,
      boards: paid.filter(
        (b) => categorizeTheme(b.title, b.description) === cat.id
      ),
    })).filter((g) => g.boards.length > 0);
  }, [boards]);

  function hasBoardAccess(b: EntryBoard): boolean {
    if (!themeBillingEnabled) return true;
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
      window.location.href = withDev(buildProfileEditPath(selectSelfPath));
    }

    return true;
  }

  async function joinMatchedBoard(
    b: EntryBoard,
    opts?: { entryMode?: MatchEntryMode; forcedClassId?: string }
  ) {
    const entryMode = opts?.entryMode ?? "voice";
    const forcedClassId = opts?.forcedClassId;
    console.log("[select] clicked board =", b, "entryMode =", entryMode, "forcedClassId =", forcedClassId);
    lastJoinBoardRef.current = b;
    setEntryFailure(null);

    // Paid themes stay visible but never enter match-join or billing.
    if (b.monthly_price > 0) {
      return;
    }

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
        entryMode,
        intentMode: joinMode,
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
        headers: {
          "content-type": "application/json",
          ...(await buildDeviceAuthHeaders(deviceId)),
        },
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
              "現在は入学受付時間外です。受付時間になったら、もう一度お試しください。"
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

      const { classId, sessionId } = resolveMatchJoinSessionIds(
        (matchJson ?? {}) as Record<string, unknown>
      );
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

      const autoCallDeviceId = String(deviceId || getDeviceId() || "").trim();

      // Open joined class → room. Fresh chat match → /room. Fresh voice → /call.
      if (matchBody.openJoinedClass) {
        const roomWithDev = buildMatchedRoomPath(classId, sessionId, {
          openJoinedClass: true,
        });
        pushRecentClass(
          {
            id: classId,
            title: b.title,
            url: roomWithDev,
          },
          20
        );
        window.location.href = roomWithDev;
        return;
      }

      if (entryMode === "chat") {
        const roomPath = buildMatchedRoomPath(classId, sessionId);
        pushRecentClass(
          {
            id: classId,
            title: b.title,
            url: roomPath,
          },
          20
        );
        window.location.href = roomPath;
        return;
      }

      const entry = prepareMatchedCallEntry({
        classId,
        sessionId,
        deviceId: autoCallDeviceId,
      });
      if (!entry.ok) {
        showEntryFailure(entry.error);
        return;
      }

      // prepareMatchedCallEntry already applies lib withDev (preserves ?dev=).
      pushRecentClass(
        {
          id: classId,
          title: b.title,
          url: entry.callPath,
        },
        20
      );

      window.location.href = entry.callPath;
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

  function BoardCard({
    b,
    accent,
    emphasizeFree = false,
  }: {
    b: EntryBoard;
    accent?: { tint: string; border: string };
    emphasizeFree?: boolean;
  }) {
    const isFree = b.monthly_price <= 0;
    const comingSoon = !isFree;
    const teaserLabel =
      String(b.badge_label ?? "").trim() || PAID_THEME_TEASER_LABEL;

    const locked = !hasBoardAccess(b);
    const profileMissing = hasProfile === false;
    const admissionClosed = !joinWindowOpen;
    const adminTestJoin =
      admissionClosed && adminAuthenticated && opsTestFlags.ignoreAdmission;
    const prefsNotReady = !prefsLoaded;
    const joinDisabled =
      comingSoon ||
      busy ||
      !deviceId ||
      profileMissing ||
      (admissionClosed && !opsTestFlags.ignoreAdmission) ||
      prefsNotReady;

    const enterReady =
      !comingSoon &&
      !locked &&
      !profileMissing &&
      (!admissionClosed || opsTestFlags.ignoreAdmission);

    const tint = comingSoon
      ? "rgba(241, 245, 249, 0.92)"
      : accent?.tint ?? (isFree ? FREE_TINT : undefined);
    const border = comingSoon
      ? "rgba(148, 163, 184, 0.35)"
      : accent?.border ?? (isFree ? "rgba(16, 185, 129, 0.28)" : undefined);

    const actionLabel = comingSoon
      ? teaserLabel
      : profileMissing
        ? "プロフィール登録が必要"
        : adminTestJoin
          ? "テスト入室"
          : admissionClosed
            ? "入学受付時間外"
            : null;

    const renderJoinButton = (mode: MatchEntryMode, label: string) => (
      <button
        type="button"
        className={[
          "cm-board-enter",
          !comingSoon && enterReady ? "cm-cta-primary" : "cm-cta-secondary",
        ].join(" ")}
        onClick={() => {
          if (comingSoon) return;
          void joinMatchedBoard(b, { entryMode: mode });
        }}
        disabled={joinDisabled}
        aria-disabled={joinDisabled}
        style={{
          width: "100%",
          padding: "10px 8px",
          color: comingSoon ? "#94a3b8" : "var(--cm-text, #0f172a)",
          fontWeight: 900,
          fontSize: 13,
          cursor: joinDisabled ? "not-allowed" : "pointer",
          opacity: joinDisabled ? 0.62 : 1,
          background: comingSoon ? "rgba(226, 232, 240, 0.9)" : undefined,
        }}
      >
        {actionLabel ?? label}
      </button>
    );

    return (
      <div
        className={[
          "cm-board-card",
          "cm-select-theme-card",
          comingSoon ? "cm-select-theme-card--teaser" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-disabled={comingSoon || undefined}
        style={{
          padding: emphasizeFree ? 16 : 12,
          background: tint,
          border: border ? `1px solid ${border}` : undefined,
          borderRadius: 16,
          boxShadow: comingSoon
            ? "none"
            : "0 4px 14px rgba(15, 23, 42, 0.04)",
          opacity: comingSoon ? 0.78 : 1,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "flex-start",
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <strong
              className="cm-board-card-title"
              style={{
                fontSize: emphasizeFree ? 17 : 15,
                display: "block",
                color: comingSoon ? "#64748b" : "#0f172a",
              }}
            >
              {isFree ? "テーマフリー" : b.title}
            </strong>
            {comingSoon && b.monthly_price > 0 ? (
              <span
                style={{
                  display: "block",
                  marginTop: 4,
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#94a3b8",
                }}
              >
                {tierName(b.monthly_price)} · ¥
                {b.monthly_price.toLocaleString("ja-JP")}/月
              </span>
            ) : null}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 4,
              flexShrink: 0,
            }}
          >
            {comingSoon ? (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#92400e",
                  background: "rgba(254, 243, 199, 0.95)",
                  border: "1px solid rgba(245, 158, 11, 0.35)",
                  borderRadius: 999,
                  padding: "3px 8px",
                }}
              >
                {teaserLabel === PAID_THEME_TEASER_LABEL ? "🔒 準備中" : teaserLabel}
              </span>
            ) : null}
            {b.is_sensitive ? (
              <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>
                🔞
              </span>
            ) : null}
            {!comingSoon && profileMissing ? (
              <span style={{ fontSize: 11, fontWeight: 700, color: "#92400e" }}>
                プロフィール未登録
              </span>
            ) : null}
          </div>
        </div>

        {b.description ? (
          <p
            style={{
              margin: "8px 0 0",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              wordBreak: "break-word",
              color: comingSoon ? "#94a3b8" : "#475569",
              lineHeight: 1.5,
              fontSize: 13,
            }}
          >
            {b.description}
          </p>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: 8,
            marginTop: 12,
          }}
        >
          {renderJoinButton("voice", "通話で始める")}
          {renderJoinButton("chat", "チャットで始める")}
        </div>
      </div>
    );
  }

  const debugProfileDeviceId = profile?.device_id ?? "-";
  const debugDisplayName = profile?.display_name ?? "-";
  const showJoinedStrip = joinedClassCount > 0;
  const isApp = isAppShellContext();

  const selectScopeClass = [
    "cm-classroom-scope",
    "cm-select-scope",
    isApp ? "app-immersive-inner" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const menuButton = (
    <button
      type="button"
      className="cm-hamburger-btn"
      aria-label="メニューを開く"
      onClick={() => setMenuOpen(true)}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        stroke="#374151"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden
      >
        <line x1="3" y1="5" x2="17" y2="5" />
        <line x1="3" y1="10" x2="17" y2="10" />
        <line x1="3" y1="15" x2="17" y2="15" />
      </svg>
      {!notificationsEnabled && !isApp ? <span className="cm-hamburger-dot" /> : null}
    </button>
  );

  return (
    <main
      className={selectScopeClass}
      style={
        {
          ...(isApp
            ? { color: "#111" }
            : { padding: "16px 16px 28px", maxWidth: 960, margin: "0 auto", color: "#111" }),
          ["--dash-primary-bg-full" as any]:
            "linear-gradient(180deg, #059669 0%, #10b981 42%, #34d399 100%)",
          ["--dash-primary-shadow" as any]:
            "0 1px 0 rgba(255, 255, 255, 0.22) inset, 0 8px 20px rgba(5, 150, 105, 0.3)",
        } as any
      }
    >
      <style>{HOME_DASHBOARD_LAYOUT_CSS}</style>

      <HomeBrandVisual menuButton={menuButton} />

      <HomeMenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        notificationsEnabled={notificationsEnabled}
        notificationsBusy={notificationsBusy}
        onToggleNotifications={toggleNotifications}
        hideWebPush={isApp}
        profileHref={withDev(buildProfileEditPath(selectSelfPath))}
        myClassesHref={withDev("/class/mine")}
        planHref={withDev("/premium")}
        billingHref={withDev("/billing")}
        accountHref={
          loggedIn
            ? withDev(buildShellAwareSettingsUrl())
            : withDev(buildShellAwareLoginUrl(selectSelfPath))
        }
        accountLabel={accountLabel}
        loggedIn={loggedIn}
        topHref={withDev("/")}
        aboutHref={withDev("/about")}
        termsHref={withDev("/terms")}
        privacyHref={withDev("/privacy")}
        guidelinesHref={withDev("/guidelines")}
        commercialHref={withDev("/legal/commercial-disclosure")}
      />

      {iosInstallGuideOpen && dismissIosInstallGuide ? (
        <IosWebPushInstallGuide
          open={iosInstallGuideOpen}
          onClose={dismissIosInstallGuide}
        />
      ) : null}

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
        <section
          className="cm-profile-needed"
          style={{ ...DASH_CARD, marginTop: 16, borderColor: "#fde68a" }}
        >
          <div style={{ fontWeight: 900, fontSize: 15, color: "#92400e" }}>
            プロフィール登録が必要です
          </div>
          <Link
            href={withDev(buildProfileEditPath(selectSelfPath))}
            className="cm-cta-primary"
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
          className="cm-join-limit"
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
              href={withDev("/class/mine")}
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
              マイクラスへ
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

      <div style={{ marginTop: 18, display: "grid", gap: 18 }}>
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 900,
              color: "#0f172a",
              letterSpacing: 0.01,
              lineHeight: 1.25,
            }}
          >
            テーマを選ぶ
          </h2>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 13,
              fontWeight: 600,
              color: "#64748b",
            }}
          >
            各テーマから通話またはチャットで始められます（最大5人）
          </p>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              borderRadius: 999,
              background: joinWindowOpen
                ? "rgba(236, 253, 245, 0.95)"
                : "rgba(241, 245, 249, 0.95)",
              border: "1px solid rgba(148, 163, 184, 0.28)",
              fontSize: 12,
              fontWeight: 800,
              color: "#334155",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: joinWindowOpen ? "#16a34a" : "#94a3b8",
              }}
            />
            {joinWindowText || (joinWindowOpen ? "入学受付中" : "入学受付時間外")}
          </span>
          {slotBillingEnabled ? (
            <span
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.85)",
                border: "1px solid rgba(148, 163, 184, 0.28)",
                fontSize: 12,
                fontWeight: 700,
                color: "#64748b",
              }}
            >
              {`${slots}クラス枠`}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void reloadCatalog();
              void refreshCurrentClass();
              if (deviceId) void refreshJoinedClassCount(deviceId);
              void reloadJoinWindow();
            }}
            disabled={loading}
            style={{
              marginLeft: "auto",
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid #e2e8f0",
              background: "#fff",
              fontSize: 12,
              fontWeight: 800,
              color: "#64748b",
              cursor: loading ? "default" : "pointer",
            }}
          >
            更新
          </button>
        </div>

        {showJoinedStrip ? (
          <Link
            href={withDev("/class/mine")}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 14,
              background: "rgba(255,255,255,0.88)",
              border: "1px solid rgba(148, 163, 184, 0.28)",
              textDecoration: "none",
              color: "#0f172a",
              boxShadow: "0 2px 8px rgba(15,23,42,0.03)",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 800 }}>
              所属中のクラス
              <span style={{ marginLeft: 8, color: "#059669" }}>
                {joinedClassCount}件
              </span>
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>
              マイクラスへ ›
            </span>
          </Link>
        ) : null}

        {!joinWindowOpen && opsTestFlags.ignoreAdmission ? (
          <p
            style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 700,
              color: "#78716c",
            }}
          >
            現在は入学受付時間外です。運営テストモードでテスト入室できます。
          </p>
        ) : null}

        <AgeFilterCard
          variant="compact"
          deviceId={deviceId}
          hasProfile={hasProfile}
          disabled={loading}
          onPrefsChange={setPrefs}
          onPrefsLoadedChange={setPrefsLoaded}
          onProfileRequired={() => {
            goProfileIfNeeded("profile_required");
          }}
        />

        <section style={{ display: "grid", gap: 10 }}>
          <h3
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            テーマフリー
          </h3>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 600,
              color: "#64748b",
            }}
          >
            テーマを決めずに、気軽に入れるクラス
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            {freeBoards.map((b) => (
              <BoardCard key={b.key} b={b} emphasizeFree />
            ))}
          </div>
        </section>

        {SHOW_PAID_THEMES_AS_TEASER && themeGroups.length > 0 ? (
          <section style={{ display: "grid", gap: 16 }}>
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 900,
                  color: "#0f172a",
                }}
              >
                テーマから探す
              </h3>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#64748b",
                }}
              >
                準備中のテーマです。通話・チャットともに参加・購入できません
              </p>
            </div>

            {themeGroups.map((group) => (
              <div key={group.id} style={{ display: "grid", gap: 8 }}>
                <h4
                  style={{
                    margin: 0,
                    fontSize: 13,
                    fontWeight: 900,
                    color: "#475569",
                    letterSpacing: "0.02em",
                  }}
                >
                  {group.label}
                </h4>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                    gap: 10,
                  }}
                >
                  {group.boards.map((b) => (
                    <BoardCard
                      key={b.key}
                      b={b}
                      accent={{ tint: group.tint, border: group.border }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ) : null}

        {!loading && freeBoards.length === 0 ? (
          <div
            className="cm-select-empty"
            style={{ marginTop: 4, fontSize: 12, color: "#666" }}
          >
            条件に合うテーマがありません
          </div>
        ) : null}
      </div>

      <div style={{ height: 24 }} />
      <DevModeSwitcher />
    </main>
  );
}
