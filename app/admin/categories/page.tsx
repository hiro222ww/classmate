"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import {
  FEATURED_HOME_MAJOR_LIMIT,
  type ThemeMajorCategoryDto,
  type ThemeOfferStatus,
  type ThemeSubCategoryDto,
} from "@/lib/themeCatalog";
import {
  adminBtn,
  adminBtnGhost,
  adminCard,
  adminFieldLabel,
  adminInput,
  adminPageInner,
  adminPageMain,
  adminTextarea,
  readJsonOrThrow,
} from "@/app/admin/adminUi";

const STATUS_OPTIONS: { value: ThemeOfferStatus; label: string }[] = [
  { value: "coming_soon", label: "準備中（表示のみ・参加不可）" },
  { value: "hidden", label: "非公開" },
  { value: "live", label: "公開" },
];

const TONE_OPTIONS = [
  "chat",
  "hobby",
  "school",
  "daily",
  "relationship",
  "identity",
  "beauty",
  "sports",
  "career",
  "creative",
];

function emptySub(majorId: string, index: number): ThemeSubCategoryDto {
  return {
    id: `${majorId}-sub-${index + 1}`,
    label: "",
    topicKeys: [],
    matchPattern: null,
    hint: null,
    status: null,
    order: (index + 1) * 10,
  };
}

export default function AdminCategoriesPage() {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<string>("");
  const [majors, setMajors] = useState<ThemeMajorCategoryDto[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const featuredCount = useMemo(
    () => majors.filter((m) => m.featuredOnHome).length,
    [majors]
  );

  async function loadAll() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/theme-categories", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "list" }),
        cache: "no-store",
      });
      const json = await readJsonOrThrow(res);
      setMajors(json.majors ?? []);
      setSource(String(json.source ?? ""));
      setMsg(
        `読み込みOK（majors:${(json.majors ?? []).length} / source:${json.source}）`
      );
    } catch (e: any) {
      setMsg(e?.message ?? "load_failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  function updateMajor(id: string, patch: Partial<ThemeMajorCategoryDto>) {
    setMajors((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const next = { ...m, ...patch };
        if (patch.featuredOnHome === true) {
          const othersFeatured = prev.filter(
            (x) => x.id !== id && x.featuredOnHome
          ).length;
          if (othersFeatured >= FEATURED_HOME_MAJOR_LIMIT) {
            setMsg(
              `ホーム掲載は最大 ${FEATURED_HOME_MAJOR_LIMIT} 件です。他の掲載を外してください。`
            );
            return m;
          }
        }
        return next;
      })
    );
  }

  function updateSub(
    majorId: string,
    subId: string,
    patch: Partial<ThemeSubCategoryDto>
  ) {
    setMajors((prev) =>
      prev.map((m) => {
        if (m.id !== majorId) return m;
        return {
          ...m,
          children: m.children.map((c) =>
            c.id === subId ? { ...c, ...patch } : c
          ),
        };
      })
    );
  }

  function addSub(majorId: string) {
    setMajors((prev) =>
      prev.map((m) => {
        if (m.id !== majorId) return m;
        return {
          ...m,
          children: [...m.children, emptySub(majorId, m.children.length)],
        };
      })
    );
  }

  function removeSub(majorId: string, subId: string) {
    setMajors((prev) =>
      prev.map((m) => {
        if (m.id !== majorId) return m;
        return {
          ...m,
          children: m.children.filter((c) => c.id !== subId),
        };
      })
    );
  }

  async function saveAll() {
    setBusy(true);
    setMsg("");
    try {
      if (featuredCount > FEATURED_HOME_MAJOR_LIMIT) {
        throw new Error(
          `ホーム掲載は最大 ${FEATURED_HOME_MAJOR_LIMIT} 件です（現在 ${featuredCount}）`
        );
      }
      const res = await fetch("/api/admin/theme-categories", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "replace", majors }),
      });
      const json = await readJsonOrThrow(res);
      setMajors(json.majors ?? majors);
      setSource("database");
      setMsg("保存しました（公開状態は課金販売の有効化とは別です）");
    } catch (e: any) {
      setMsg(e?.message ?? "save_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={adminPageMain}>
      <div style={adminPageInner}>
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
            marginBottom: 16,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>
              カテゴリー管理
            </h1>
            <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 13 }}>
              大カテゴリー／小カテゴリー・表示順・公開状態・ホーム掲載（最大
              {FEATURED_HOME_MAJOR_LIMIT}）。テーマ課金の販売ON/OFFとは別設定です。
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              style={adminBtnGhost}
              onClick={() => (window.location.href = "/admin/topics")}
            >
              テーマ管理へ
            </button>
            <button
              type="button"
              style={adminBtnGhost}
              onClick={() => (window.location.href = "/admin")}
            >
              管理ホーム
            </button>
          </div>
        </header>

        <div style={{ ...adminCard, marginBottom: 14, display: "grid", gap: 10 }}>
          <div style={{ fontSize: 13, color: "#374151" }}>
            source: <strong>{source || "—"}</strong> / ホーム掲載{" "}
            <strong>
              {featuredCount}/{FEATURED_HOME_MAJOR_LIMIT}
            </strong>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: "#92400e" }}>
            注意: 現状の有料テーマはすべて「準備中」のままにしてください。公開にすると探すに出ますが、課金販売の有効化にはなりません。
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={adminBtnGhost} disabled={busy} onClick={() => void loadAll()}>
              再読み込み
            </button>
            <button type="button" style={adminBtn} disabled={busy} onClick={() => void saveAll()}>
              保存
            </button>
          </div>
          {msg ? (
            <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
              {msg}
            </div>
          ) : null}
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          {majors.map((major) => {
            const open = expandedId === major.id;
            return (
              <section key={major.id} style={adminCard}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <div>
                    <strong style={{ fontSize: 16 }}>{major.label}</strong>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      id: {major.id} / order: {major.order}
                    </div>
                  </div>
                  <button
                    type="button"
                    style={adminBtnGhost}
                    onClick={() =>
                      setExpandedId((prev) => (prev === major.id ? null : major.id))
                    }
                  >
                    {open ? "閉じる" : "編集"}
                  </button>
                </div>

                {open ? (
                  <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                    <label style={adminFieldLabel}>
                      名前
                      <input
                        style={adminInput}
                        value={major.label}
                        onChange={(e) =>
                          updateMajor(major.id, { label: e.target.value })
                        }
                      />
                    </label>
                    <label style={adminFieldLabel}>
                      説明（ヒント）
                      <input
                        style={adminInput}
                        value={major.hint}
                        onChange={(e) =>
                          updateMajor(major.id, { hint: e.target.value })
                        }
                      />
                    </label>
                    <label style={adminFieldLabel}>
                      詳細説明
                      <textarea
                        style={adminTextarea}
                        rows={2}
                        value={major.description}
                        onChange={(e) =>
                          updateMajor(major.id, { description: e.target.value })
                        }
                      />
                    </label>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 10,
                      }}
                    >
                      <label style={adminFieldLabel}>
                        アイコンキー
                        <select
                          style={adminInput}
                          value={major.iconKey}
                          onChange={(e) =>
                            updateMajor(major.id, { iconKey: e.target.value })
                          }
                        >
                          {TONE_OPTIONS.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={adminFieldLabel}>
                        カラー（tone）
                        <select
                          style={adminInput}
                          value={major.tone}
                          onChange={(e) =>
                            updateMajor(major.id, { tone: e.target.value })
                          }
                        >
                          {TONE_OPTIONS.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={adminFieldLabel}>
                        表示順
                        <input
                          style={adminInput}
                          type="number"
                          value={major.order}
                          onChange={(e) =>
                            updateMajor(major.id, {
                              order: Number(e.target.value) || 0,
                            })
                          }
                        />
                      </label>
                      <label style={adminFieldLabel}>
                        公開状態
                        <select
                          style={adminInput}
                          value={major.status}
                          onChange={(e) =>
                            updateMajor(major.id, {
                              status: e.target.value as ThemeOfferStatus,
                            })
                          }
                        >
                          {STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={major.featuredOnHome}
                        onChange={(e) =>
                          updateMajor(major.id, {
                            featuredOnHome: e.target.checked,
                          })
                        }
                      />
                      ホームに掲載（最大 {FEATURED_HOME_MAJOR_LIMIT}）
                    </label>

                    <div
                      style={{
                        borderTop: "1px solid #e5e7eb",
                        paddingTop: 10,
                        display: "grid",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <strong>小カテゴリー</strong>
                        <button
                          type="button"
                          style={adminBtnGhost}
                          onClick={() => addSub(major.id)}
                        >
                          ＋ 追加
                        </button>
                      </div>
                      {major.children.map((child) => (
                        <div
                          key={child.id}
                          style={{
                            border: "1px solid #e5e7eb",
                            borderRadius: 12,
                            padding: 10,
                            display: "grid",
                            gap: 8,
                            background: "#f9fafb",
                          }}
                        >
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr",
                              gap: 8,
                            }}
                          >
                            <label style={adminFieldLabel}>
                              ID
                              <input
                                style={adminInput}
                                value={child.id}
                                onChange={(e) =>
                                  updateSub(major.id, child.id, {
                                    id: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <label style={adminFieldLabel}>
                              名前
                              <input
                                style={adminInput}
                                value={child.label}
                                onChange={(e) =>
                                  updateSub(major.id, child.id, {
                                    label: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <label style={adminFieldLabel}>
                              topic_keys（カンマ区切り）
                              <input
                                style={adminInput}
                                value={child.topicKeys.join(",")}
                                onChange={(e) =>
                                  updateSub(major.id, child.id, {
                                    topicKeys: e.target.value
                                      .split(",")
                                      .map((s) => s.trim())
                                      .filter(Boolean),
                                  })
                                }
                              />
                            </label>
                            <label style={adminFieldLabel}>
                              表示順
                              <input
                                style={adminInput}
                                type="number"
                                value={child.order}
                                onChange={(e) =>
                                  updateSub(major.id, child.id, {
                                    order: Number(e.target.value) || 0,
                                  })
                                }
                              />
                            </label>
                          </div>
                          <label style={adminFieldLabel}>
                            状態（空=親を継承）
                            <select
                              style={adminInput}
                              value={child.status ?? ""}
                              onChange={(e) =>
                                updateSub(major.id, child.id, {
                                  status: e.target.value
                                    ? (e.target.value as ThemeOfferStatus)
                                    : null,
                                })
                              }
                            >
                              <option value="">親カテゴリーに従う</option>
                              {STATUS_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            style={adminBtnGhost}
                            onClick={() => removeSub(major.id, child.id)}
                          >
                            この小カテゴリーを削除
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
