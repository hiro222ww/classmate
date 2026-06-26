"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HelpTip } from "@/components/HelpTip";
import {
  adultOnlyUserMessage,
  resolveAgeModeFromSettings,
  type AgeMode,
} from "@/lib/agePolicyRules";
import { logMatchPrefsGet } from "@/lib/entryFlowLog";
import {
  AGE_FILTER_OFF_MAX,
  AGE_FILTER_OFF_MIN,
  AGE_FILTER_OFF_PREFS,
  AGE_PREF_HELP_TEXT,
  clampAge,
  isAgeFilterOff,
  matchPrefsForSubmit,
  normalizeMatchPrefs,
  resolveAgeFilterOnDefault,
  resolveAgeFilterSliderBounds,
  sanitizeActiveMatchPrefs,
  type MatchPrefs,
} from "@/components/dashboard/ageFilterConstants";
import { normalizePrefsAge } from "@/lib/agePolicyRules";
import { CHIP, DASH_CARD } from "@/components/dashboard/dashboardStyles";

type AgeFilterCardProps = {
  deviceId: string;
  hasProfile: boolean | null;
  disabled?: boolean;
  className?: string;
  onPrefsChange?: (prefs: MatchPrefs) => void;
  onPrefsLoadedChange?: (loaded: boolean) => void;
  onProfileRequired?: () => void;
};

export function AgeFilterCard({
  deviceId,
  hasProfile,
  disabled = false,
  className,
  onPrefsChange,
  onPrefsLoadedChange,
  onProfileRequired,
}: AgeFilterCardProps) {
  const [prefs, setPrefs] = useState<MatchPrefs>(AGE_FILTER_OFF_PREFS);
  const [draftPrefs, setDraftPrefs] = useState<MatchPrefs>(AGE_FILTER_OFF_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [editing, setEditing] = useState(false);
  const [ageMode, setAgeMode] = useState<AgeMode>("post_high_school_only");
  const [selfAge, setSelfAge] = useState<number | null>(null);
  const sliderBounds = useMemo(
    () => resolveAgeFilterSliderBounds(ageMode, selfAge),
    [ageMode, selfAge]
  );
  const defaultOnPrefs = useMemo(
    () => resolveAgeFilterOnDefault(ageMode, selfAge),
    [ageMode, selfAge]
  );
  const activePrefs = useMemo(
    () => sanitizeActiveMatchPrefs(prefs, ageMode, selfAge),
    [prefs, ageMode, selfAge]
  );
  const lastOnPrefsRef = useRef<MatchPrefs>(defaultOnPrefs);

  useEffect(() => {
    lastOnPrefsRef.current = defaultOnPrefs;
  }, [defaultOnPrefs]);

  const ageFilterEnabled = !isAgeFilterOff(activePrefs);
  const displayMinAge = Math.min(activePrefs.min_age, activePrefs.max_age);
  const displayMaxAge = Math.max(activePrefs.min_age, activePrefs.max_age);
  const draftMinAge = Math.min(draftPrefs.min_age, draftPrefs.max_age);
  const draftMaxAge = Math.max(draftPrefs.min_age, draftPrefs.max_age);

  const applyPrefs = useCallback(
    (next: MatchPrefs) => {
      setPrefs(next);
      onPrefsChange?.(next);
    },
    [onPrefsChange]
  );

  const savePrefs = useCallback(
    async (next: MatchPrefs) => {
      if (!deviceId || hasProfile === false) return false;

      const payload = matchPrefsForSubmit(next);
      setSavingPrefs(true);
      try {
        const r = await fetch("/api/user/match-prefs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            deviceId,
            minAge: payload.min_age,
            maxAge: payload.max_age,
          }),
          cache: "no-store",
        });

        const raw = await r.text();
        let j: {
          error?: string;
          message?: string;
          minAge?: number;
          maxAge?: number;
        } | null = null;

        try {
          j = raw ? JSON.parse(raw) : null;
        } catch {
          j = null;
        }

        if (!r.ok) {
          if (j?.error === "profile_required") {
            onProfileRequired?.();
            return false;
          }
          throw new Error(j?.error ?? j?.message ?? `match_prefs_save:${r.status}`);
        }

        const saved = normalizeMatchPrefs({
          min_age: Number(j?.minAge ?? payload.min_age),
          max_age: Number(j?.maxAge ?? payload.max_age),
        });
        if (!isAgeFilterOff(saved)) {
          lastOnPrefsRef.current = saved;
        }
        applyPrefs(saved);
        return true;
      } catch (e: unknown) {
        alert(e instanceof Error ? e.message : "failed");
        return false;
      } finally {
        setSavingPrefs(false);
      }
    },
    [applyPrefs, deviceId, hasProfile, onProfileRequired]
  );

  const handleAgeFilterToggle = useCallback(
    async (enabled: boolean) => {
      let next: MatchPrefs;
      if (enabled) {
        next = sanitizeActiveMatchPrefs(lastOnPrefsRef.current, ageMode, selfAge);
      } else {
        if (!isAgeFilterOff(activePrefs)) {
          lastOnPrefsRef.current = sanitizeActiveMatchPrefs(
            activePrefs,
            ageMode,
            selfAge
          );
        }
        next = AGE_FILTER_OFF_PREFS;
        setEditing(false);
      }
      applyPrefs(next);
      await savePrefs(next);
    },
    [activePrefs, ageMode, applyPrefs, savePrefs, selfAge]
  );

  const openEditor = useCallback(() => {
    setDraftPrefs(sanitizeActiveMatchPrefs(activePrefs, ageMode, selfAge));
    setEditing(true);
  }, [activePrefs, ageMode, selfAge]);

  const finishEditing = useCallback(async () => {
    const ok = await savePrefs(draftPrefs);
    if (ok) {
      setEditing(false);
    }
  }, [draftPrefs, savePrefs]);

  useEffect(() => {
    let alive = true;

    void (async () => {
      if (!deviceId) {
        if (alive) {
          applyPrefs(AGE_FILTER_OFF_PREFS);
          setPrefsLoaded(true);
          onPrefsLoadedChange?.(true);
        }
        return;
      }

      setPrefsLoaded(false);
      onPrefsLoadedChange?.(false);

      try {
        let loadedAgeMode: AgeMode = "post_high_school_only";
        let loadedSelfAge: number | null = null;

        const settingsRes = await fetch("/api/settings", { cache: "no-store" });
        if (settingsRes.ok) {
          const settingsJson = await settingsRes.json().catch(() => null);
          loadedAgeMode = resolveAgeModeFromSettings(settingsJson);
          if (alive) {
            setAgeMode(loadedAgeMode);
          }
        } else if (alive) {
          setAgeMode("post_high_school_only");
        }

        if (hasProfile !== false && deviceId) {
          const profileRes = await fetch(
            `/api/profile?device_id=${encodeURIComponent(deviceId)}`,
            { cache: "no-store" }
          );
          if (profileRes.ok) {
            const profileJson = await profileRes.json().catch(() => null);
            const age = Number(profileJson?.profile?.age);
            if (Number.isFinite(age)) {
              loadedSelfAge = age;
              if (alive) {
                setSelfAge(age);
              }
            }
          }
        }

        const pr = await fetch("/api/user/match-prefs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deviceId, mode: "get" }),
          cache: "no-store",
        });

        const raw = await pr.text();
        let pj: {
          prefs?: { min_age?: number; max_age?: number };
          profileRequired?: boolean;
          error?: string;
        } | null = null;

        try {
          pj = raw ? JSON.parse(raw) : null;
        } catch {
          pj = null;
        }

        if (!alive) return;

        if (pr.ok && pj?.prefs) {
          const rawPrefs = normalizeMatchPrefs({
            min_age: normalizePrefsAge(pj.prefs.min_age, AGE_FILTER_OFF_MIN),
            max_age: normalizePrefsAge(pj.prefs.max_age, AGE_FILTER_OFF_MAX),
          });
          const nextPrefs = sanitizeActiveMatchPrefs(
            rawPrefs,
            loadedAgeMode,
            loadedSelfAge
          );
          if (!isAgeFilterOff(nextPrefs)) {
            lastOnPrefsRef.current = nextPrefs;
          }
          applyPrefs(nextPrefs);
          logMatchPrefsGet(
            deviceId,
            pj.profileRequired === true ? "profile_required" : "saved"
          );
        } else if (pr.status === 409 && pj?.error === "profile_required") {
          logMatchPrefsGet(deviceId, "profile_required");
        } else {
          logMatchPrefsGet(deviceId, "failed");
        }
      } catch (e) {
        console.warn("[age-filter] load failed", e);
      } finally {
        if (alive) {
          setPrefsLoaded(true);
          onPrefsLoadedChange?.(true);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [applyPrefs, deviceId, hasProfile, onPrefsLoadedChange]);

  const controlsDisabled =
    disabled ||
    savingPrefs ||
    !deviceId ||
    !prefsLoaded ||
    hasProfile === false;

  return (
    <section className={className} style={DASH_CARD}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <strong style={{ fontSize: 15, fontWeight: 900, color: "#111827" }}>
            年齢絞り込み
          </strong>
          <HelpTip label="年齢絞り込みについて" content={AGE_PREF_HELP_TEXT} />
        </div>

        <div
          style={{
            display: "inline-flex",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            overflow: "hidden",
            flexShrink: 0,
            opacity: !prefsLoaded ? 0.55 : 1,
          }}
          role="group"
          aria-label="年齢絞り込み"
        >
          <button
            type="button"
            onClick={() => void handleAgeFilterToggle(false)}
            disabled={controlsDisabled}
            style={{
              padding: "7px 12px",
              border: "none",
              background: !ageFilterEnabled ? "#111827" : "#fff",
              color: !ageFilterEnabled ? "#fff" : "#374151",
              fontWeight: 900,
              fontSize: 12,
              cursor: controlsDisabled ? "default" : "pointer",
            }}
          >
            OFF
          </button>
          <button
            type="button"
            onClick={() => void handleAgeFilterToggle(true)}
            disabled={controlsDisabled}
            style={{
              padding: "7px 12px",
              border: "none",
              borderLeft: "1px solid #e5e7eb",
              background: ageFilterEnabled ? "#111827" : "#fff",
              color: ageFilterEnabled ? "#fff" : "#374151",
              fontWeight: 900,
              fontSize: 12,
              cursor: controlsDisabled ? "default" : "pointer",
            }}
          >
            ON
          </button>
        </div>
      </div>

      {ageFilterEnabled && hasProfile !== false && !editing ? (
        <div
          style={{
            marginTop: 10,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={CHIP}>
            {displayMinAge}〜{displayMaxAge}歳
          </span>
          <button
            type="button"
            onClick={openEditor}
            disabled={controlsDisabled}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              background: "#fff",
              color: "#6b7280",
              fontWeight: 800,
              fontSize: 12,
              cursor: controlsDisabled ? "default" : "pointer",
            }}
          >
            編集
          </button>
        </div>
      ) : null}

      {ageFilterEnabled && hasProfile !== false && editing ? (
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#374151" }}>
            {draftMinAge}〜{draftMaxAge}歳
          </div>

          {ageMode === "post_high_school_only" && draftMinAge < 18 ? (
            <p style={{ margin: 0, fontSize: 12, color: "#92400e" }}>
              {adultOnlyUserMessage()}
            </p>
          ) : null}

          <input
            type="range"
            aria-label="最小年齢"
            min={sliderBounds.sliderMin}
            max={sliderBounds.sliderMax}
            value={draftMinAge}
            onChange={(e) => {
              const v = clampAge(
                Number(e.target.value),
                sliderBounds.sliderMin,
                sliderBounds.sliderMax
              );
              setDraftPrefs((p) => ({
                min_age: v,
                max_age: Math.max(v, p.max_age),
              }));
            }}
            style={{ width: "100%" }}
          />
          <input
            type="range"
            aria-label="最大年齢"
            min={sliderBounds.sliderMin}
            max={sliderBounds.sliderMax}
            value={draftMaxAge}
            onChange={(e) => {
              const v = clampAge(
                Number(e.target.value),
                sliderBounds.sliderMin,
                sliderBounds.sliderMax
              );
              setDraftPrefs((p) => ({
                min_age: Math.min(p.min_age, v),
                max_age: v,
              }));
            }}
            style={{ width: "100%" }}
          />

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => void finishEditing()}
              disabled={savingPrefs}
              style={{
                flex: 1,
                padding: "9px 12px",
                borderRadius: 10,
                border: "none",
                background: "#111827",
                color: "#fff",
                fontWeight: 900,
                fontSize: 13,
                cursor: savingPrefs ? "default" : "pointer",
                opacity: savingPrefs ? 0.7 : 1,
              }}
            >
              完了
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={savingPrefs}
              style={{
                padding: "9px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fff",
                color: "#6b7280",
                fontWeight: 800,
                fontSize: 13,
                cursor: savingPrefs ? "default" : "pointer",
              }}
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
