import { describe, expect, it } from "vitest";
import {
  createDefaultCallDemoState,
  createPresetState,
  visibleDemoMembers,
  applySpeakingSelection,
  OFFICIAL_MEMBERS,
} from "./defaults";
import { sanitizeCallDemoState } from "./storage";

describe("callDemo defaults", () => {
  it("defaults to めいか・めいと・くらと (3)", () => {
    const state = createDefaultCallDemoState();
    expect(state.memberCount).toBe(3);
    const visible = visibleDemoMembers(state);
    expect(visible.map((m) => m.displayName)).toEqual([
      "めいか",
      "めいと",
      "くらと",
    ]);
    expect(OFFICIAL_MEMBERS).toHaveLength(3);
  });

  it("switches member counts while preserving slot edits", () => {
    const state = createDefaultCallDemoState();
    state.members[0].displayName = "Alice";
    state.memberCount = 1;
    expect(visibleDemoMembers(state).map((m) => m.displayName)).toEqual([
      "Alice",
    ]);
    state.memberCount = 3;
    expect(visibleDemoMembers(state)[0]?.displayName).toBe("Alice");
  });

  it("applies dual speaking", () => {
    const members = applySpeakingSelection(
      createDefaultCallDemoState().members,
      3,
      0,
      true
    );
    expect(members.filter((m) => m.speaking).map((m) => m.displayName)).toEqual(
      ["めいか", "めいと"]
    );
  });

  it("loads presets", () => {
    expect(createPresetState("users3").members[0]?.displayName).toBe(
      "ユーザーA"
    );
    expect(createPresetState("max5").memberCount).toBe(5);
    expect(createPresetState("joinDemo").memberCount).toBe(2);
    expect(createPresetState("leaveDemo").memberCount).toBe(3);
  });

  it("sanitizes persisted state", () => {
    const out = sanitizeCallDemoState({
      version: 1,
      memberCount: 4,
      members: [{ id: "x", displayName: "Renamed" }],
      filmingMode: true,
    });
    expect(out.memberCount).toBe(4);
    expect(out.members[0]?.displayName).toBe("Renamed");
    expect(out.filmingMode).toBe(true);
  });
});

describe("callDemo isolation", () => {
  it("demo client module does not import WebRTC or mic helpers", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const root = process.cwd();
    const files = [
      "app/call/demo/CallDemoClient.tsx",
      "app/call/demo/CallDemoControlPanel.tsx",
      "app/call/demo/page.tsx",
      "components/call/CallRoomStage.tsx",
      "lib/callDemo/defaults.ts",
      "lib/callDemo/storage.ts",
    ];
    const bannedImport = [
      /from\s+["'][^"']*CallVoiceLayer["']/,
      /from\s+["'][^"']*useLocalMic["']/,
      /from\s+["']@\/lib\/supabase/,
      /getUserMedia\s*\(/,
      /new\s+RTCPeerConnection\s*\(/,
      /session_members/,
    ];
    for (const rel of files) {
      const text = await fs.readFile(path.join(root, rel), "utf8");
      for (const pattern of bannedImport) {
        expect(pattern.test(text), `${rel} must not match ${pattern}`).toBe(
          false
        );
      }
    }
  });
});
