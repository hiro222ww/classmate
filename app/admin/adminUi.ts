import type { CSSProperties } from "react";

export async function readJsonOrThrow(r: Response) {
  const raw = await r.text();
  const ct = r.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    console.error("Non-JSON response:", raw);
    throw new Error("non_json_response");
  }
  const j = JSON.parse(raw);
  if (!r.ok) throw new Error(j?.error ?? "request_failed");
  return j;
}

export const adminCard: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 16,
  background: "#fff",
};

export const adminBtn: CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid #111827",
  background: "#111827",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

export const adminBtnGhost: CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  fontWeight: 900,
  cursor: "pointer",
};

export const adminInput: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #d1d5db",
  fontSize: 13,
};

export const adminTextarea: CSSProperties = {
  ...adminInput,
  width: "100%",
  resize: "vertical",
  lineHeight: 1.6,
};

export const adminFieldLabel: CSSProperties = {
  fontSize: 12,
  color: "#666",
  display: "grid",
  gap: 6,
};

export const adminPageMain: CSSProperties = {
  minHeight: "100vh",
  background: "#f8fafc",
  padding: 20,
  color: "#111827",
};

export const adminPageInner: CSSProperties = {
  maxWidth: 960,
  margin: "0 auto",
};
