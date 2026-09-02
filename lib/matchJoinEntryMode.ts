export type MatchEntryMode = "voice" | "chat";

/** Normalize API/client entry mode; defaults to voice (immediate /call path). */
export function normalizeMatchEntryMode(value: unknown): MatchEntryMode {
  const v = String(value ?? "")
    .trim()
    .toLowerCase();
  return v === "chat" ? "chat" : "voice";
}
