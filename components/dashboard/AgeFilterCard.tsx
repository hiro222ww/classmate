"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HelpTip } from "@/components/HelpTip";
import { logMatchPrefsGet } from "@/lib/entryFlowLog";
import {
  AGE_FILTER_OFF_MAX,
  AGE_FILTER_OFF_MIN,
  AGE_FILTER_OFF_PREFS,
  AGE_FILTER_ON_DEFAULT,
  AGE_FILTER_SLIDER_MAX,
  AGE_FILTER_SLIDER_MIN,
  AGE_PREF_HELP_TEXT,
  clampAge,
  isAgeFilterOff,
  matchPrefsForSubmit,
  normalizeMatchPrefs,
  type MatchPrefs,
} from "@/components/dashboard/ageFilterConstants";
import { DASH_CARD, SECONDARY_BTN } from "@/components/dashboard/dashboardStyles";

type AgeFilterCardProps = {
  deviceId: string;
  hasProfile: boolean | null;
  disabled?: boolean;
  className?: string;
};

export function AgeFilterCard({
  deviceId,
  hasProfile,
  disabled = false,
  className,
}: AgeFilterCardProps) {
  const [prefs, setPrefs] = useState<MatchPrefs>(AGE_FILTER_OFF_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [minorsEnabled, setMinorsEnabled] = useState(false);
  const lastOnPrefsRef = useRef<MatchPrefs>(AGE_FILTER_ON_DEFAULT);

  const ageFilterEnabled = !isAgeFilterOff(prefs);
  const displayMinAge = Math.min(prefs.min_age, prefs.max_age);
  const displayMaxAge = Math.max(prefs.min_age, prefs.max_age);

  const savePrefs = useCallback(
    async (next: MatchPrefs) => {
      if (!deviceId || hasProfile === false) return;

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
            alert(
              j.message ?? "プロフィール登録後に年齢条件を保存できます。"
            );
            return;
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
        setPrefs(saved);
      } catch (e: unknown) {
        alert(e instanceof Error ? e.message : "failed");
      } finally {
        setSavingPrefs(false);
      }
    },
    [deviceId, hasProfile]
  );

  const handleAgeFilterToggle = useCallback(
    async (enabled: boolean) => {
      let next: MatchPrefs;
      if (enabled) {
        next = lastOnPrefsRef.current;
      } else {
        if (!isAgeFilterOff(prefs)) {
          lastOnPrefsRef.current = normalizeMatchPrefs(prefs);
        }
        next = AGE_FILTER_OFF_PREFS;
      }
      setPrefs(next);
      await savePrefs(next);
    },
    [prefs, savePrefs]
  );

  useEffect(() => {
    let alive = true;

    void (async () => {
      if (!deviceId) {
        if (alive) {
          setPrefs(AGE_FILTER_OFF_PREFS);
          setPrefsLoaded(true);
        }
        return;
      }

      setPrefsLoaded(false);

      try {
        const settingsRes = await fetch("/api/settings", { cache: "no-store" });
        if (settingsRes.ok) {
          const settingsJson = await settingsRes.json().catch(() => null);
          if (alive) {
            setMinorsEnabled(settingsJson?.minors_enabled === true);
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
          const nextPrefs = normalizeMatchPrefs({
            min_age: Number(pj.prefs.min_age ?? AGE_FILTER_OFF_MIN),
            max_age: Number(pj.prefs.max_age ?? AGE_FILTER_OFF_MAX),
          });
          if (!isAgeFilterOff(nextPrefs)) {
            lastOnPrefsRef.current = nextPrefs;
          }
          setPrefs(nextPrefs);
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
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [deviceId]);

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
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <strong style={{ fontSize: 16, fontWeight: 900 }}>年齢絞り込み</strong>
          <HelpTip label="年齢絞り込みについて" content={AGE_PREF_HELP_TEXT} />
        </div>

        <div
          style={{
            display: "inline-flex",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
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
              padding: "8px 14px",
              border: "none",
              background: !ageFilterEnabled ? "#111827" : "#fff",
              color: !ageFilterEnabled ? "#fff" : "#374151",
              fontWeight: 900,
              fontSize: 13,
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
              padding: "8px 14px",
              border: "none",
              borderLeft: "1px solid #e5e7eb",
              background: ageFilterEnabled ? "#111827" : "#fff",
              color: ageFilterEnabled ? "#fff" : "#374151",
              fontWeight: 900,
              fontSize: 13,
              cursor: controlsDisabled ? "default" : "pointer",
            }}
          >
            ON
          </button>
        </div>
      </div>

      {ageFilterEnabled && hasProfile !== false ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 15 }}>
            {displayMinAge} 〜 {displayMaxAge} 歳
          </div>

          {!minorsEnabled && displayMinAge < 18 ? (
            <p
              style={{
                margin: "0 0 10px",
                fontSize: 12,
                color: "#92400e",
                lineHeight: 1.6,
              }}
            >
              高校生以下は利用できません。
            </p>
          ) : null}

          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>最小</div>
              <input
                type="range"
                min={AGE_FILTER_SLIDER_MIN}
                max={AGE_FILTER_SLIDER_MAX}
                value={displayMinAge}
                onChange={(e) => {
                  const v = clampAge(
                    Number(e.target.value),
                    AGE_FILTER_SLIDER_MIN,
                    AGE_FILTER_SLIDER_MAX
                  );
                  setPrefs((p) => ({
                    min_age: v,
                    max_age: Math.max(v, p.max_age),
                  }));
                }}
                style={{ width: "100%" }}
              />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>最大</div>
              <input
                type="range"
                min={AGE_FILTER_SLIDER_MIN}
                max={AGE_FILTER_SLIDER_MAX}
                value={displayMaxAge}
                onChange={(e) => {
                  const v = clampAge(
                    Number(e.target.value),
                    AGE_FILTER_SLIDER_MIN,
                    AGE_FILTER_SLIDER_MAX
                  );
                  setPrefs((p) => ({
                    min_age: Math.min(p.min_age, v),
                    max_age: v,
                  }));
                }}
                style={{ width: "100%" }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => void savePrefs(prefs)}
            disabled={savingPrefs || !deviceId || disabled}
            style={{
              ...SECONDARY_BTN,
              marginTop: 12,
            }}
          >
            保存
          </button>
        </div>
      ) : null}
    </section>
  );
}
