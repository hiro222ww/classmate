import { describe, expect, it } from "vitest";
import {
  canStartMatchJoin,
  formatAdmissionClosedNotice,
  guardMatchJoinAdmission,
  isMatchJoinBlockedByAdmission,
  resolveAdmissionStatusNotice,
  resolveAdmissionStatusPillText,
} from "@/lib/admissionJoinGate";

describe("canStartMatchJoin", () => {
  it("blocks voice and chat when admission is closed", () => {
    expect(
      canStartMatchJoin({
        loadState: "ready",
        joinWindowOpen: false,
        ignoreAdmission: false,
      })
    ).toBe(false);
    expect(
      isMatchJoinBlockedByAdmission({
        loadState: "ready",
        joinWindowOpen: false,
      })
    ).toBe(true);
  });

  it("allows voice and chat when admission is open", () => {
    expect(
      canStartMatchJoin({
        loadState: "ready",
        joinWindowOpen: true,
      })
    ).toBe(true);
  });

  it("blocks while admission status is loading", () => {
    expect(
      canStartMatchJoin({
        loadState: "loading",
        joinWindowOpen: true,
      })
    ).toBe(false);
  });

  it("blocks when admission status fetch failed", () => {
    expect(
      canStartMatchJoin({
        loadState: "error",
        joinWindowOpen: false,
      })
    ).toBe(false);
  });

  it("allows admin bypass when closed", () => {
    expect(
      canStartMatchJoin({
        loadState: "ready",
        joinWindowOpen: false,
        ignoreAdmission: true,
      })
    ).toBe(true);
    expect(
      guardMatchJoinAdmission({
        loadState: "ready",
        joinWindowOpen: false,
        ignoreAdmission: true,
      })
    ).toBe(true);
  });
});

describe("resolveAdmissionStatusNotice", () => {
  it("shows loading copy while unresolved", () => {
    expect(
      resolveAdmissionStatusNotice({
        loadState: "loading",
        joinWindowOpen: false,
      })
    ).toEqual({ kind: "loading", text: "受付状況を確認中…" });
  });

  it("shows error copy on fetch failure", () => {
    expect(
      resolveAdmissionStatusNotice({
        loadState: "error",
        joinWindowOpen: false,
      })
    ).toEqual({ kind: "error", text: "受付状況を確認できませんでした" });
  });

  it("shows closed copy only after ready with open=false", () => {
    expect(
      resolveAdmissionStatusNotice({
        loadState: "ready",
        joinWindowOpen: false,
        admissionText: "ただいま入学受付時間外です（受付時間：21:00〜0:00）",
      })
    ).toEqual({
      kind: "closed",
      text: "ただいま受付時間外です（受付時間：21:00〜0:00）",
    });
  });

  it("returns null while open", () => {
    expect(
      resolveAdmissionStatusNotice({
        loadState: "ready",
        joinWindowOpen: true,
        admissionText: "入学受付中",
      })
    ).toBeNull();
  });
});

describe("formatAdmissionClosedNotice", () => {
  it("normalizes API closed text", () => {
    expect(
      formatAdmissionClosedNotice(
        "ただいま入学受付時間外です（受付時間：21:00〜0:00）"
      )
    ).toBe("ただいま受付時間外です（受付時間：21:00〜0:00）");
  });
});

describe("resolveAdmissionStatusPillText", () => {
  it("uses loading and error labels", () => {
    expect(
      resolveAdmissionStatusPillText({
        loadState: "loading",
        joinWindowOpen: false,
      })
    ).toBe("受付状況を確認中…");
    expect(
      resolveAdmissionStatusPillText({
        loadState: "error",
        joinWindowOpen: false,
      })
    ).toBe("受付状況を確認できませんでした");
  });
});

describe("guardMatchJoinAdmission", () => {
  it("does not proceed to match-join when admission is closed", () => {
    let matchJoinCalls = 0;
    const tryJoin = () => {
      if (
        guardMatchJoinAdmission({
          loadState: "ready",
          joinWindowOpen: false,
        })
      ) {
        matchJoinCalls += 1;
      }
    };
    tryJoin();
    tryJoin();
    expect(matchJoinCalls).toBe(0);
  });

  it("does not proceed while loading even if spam-clicked", () => {
    let matchJoinCalls = 0;
    for (let i = 0; i < 5; i += 1) {
      if (
        guardMatchJoinAdmission({
          loadState: "loading",
          joinWindowOpen: true,
        })
      ) {
        matchJoinCalls += 1;
      }
    }
    expect(matchJoinCalls).toBe(0);
  });

  it("allows match-join for voice and chat when admission is open", () => {
    let matchJoinCalls = 0;
    for (const _mode of ["voice", "chat"] as const) {
      if (
        guardMatchJoinAdmission({
          loadState: "ready",
          joinWindowOpen: true,
        })
      ) {
        matchJoinCalls += 1;
      }
    }
    expect(matchJoinCalls).toBe(2);
  });
});
