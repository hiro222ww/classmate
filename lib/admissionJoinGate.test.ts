import { describe, expect, it } from "vitest";
import {
  canStartMatchJoin,
  formatAdmissionClosedNotice,
  guardMatchJoinAdmission,
  isMatchJoinBlockedByAdmission,
} from "@/lib/admissionJoinGate";

describe("canStartMatchJoin", () => {
  it("blocks voice and chat when admission is closed", () => {
    expect(
      canStartMatchJoin({
        admissionResolved: true,
        joinWindowOpen: false,
        ignoreAdmission: false,
      })
    ).toBe(false);
    expect(
      isMatchJoinBlockedByAdmission({
        admissionResolved: true,
        joinWindowOpen: false,
      })
    ).toBe(true);
  });

  it("allows voice and chat when admission is open", () => {
    expect(
      canStartMatchJoin({
        admissionResolved: true,
        joinWindowOpen: true,
      })
    ).toBe(true);
  });

  it("blocks until admission status is resolved", () => {
    expect(
      canStartMatchJoin({
        admissionResolved: false,
        joinWindowOpen: true,
      })
    ).toBe(false);
  });

  it("allows admin bypass when closed", () => {
    expect(
      canStartMatchJoin({
        admissionResolved: true,
        joinWindowOpen: false,
        ignoreAdmission: true,
      })
    ).toBe(true);
    expect(
      guardMatchJoinAdmission({
        admissionResolved: true,
        joinWindowOpen: false,
        ignoreAdmission: true,
      })
    ).toBe(true);
  });
});

describe("formatAdmissionClosedNotice", () => {
  it("normalizes API closed text", () => {
    expect(
      formatAdmissionClosedNotice(
        false,
        "ただいま入学受付時間外です（受付時間：21:00〜0:00）"
      )
    ).toBe("ただいま受付時間外です（受付時間：21:00〜0:00）");
  });

  it("returns null while open", () => {
    expect(formatAdmissionClosedNotice(true, "入学受付中")).toBeNull();
  });
});

describe("guardMatchJoinAdmission", () => {
  it("does not proceed to match-join when admission is closed", () => {
    let matchJoinCalls = 0;
    const tryJoin = () => {
      if (
        guardMatchJoinAdmission({
          admissionResolved: true,
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

  it("allows match-join for voice and chat when admission is open", () => {
    let matchJoinCalls = 0;
    for (const _mode of ["voice", "chat"] as const) {
      if (
        guardMatchJoinAdmission({
          admissionResolved: true,
          joinWindowOpen: true,
        })
      ) {
        matchJoinCalls += 1;
      }
    }
    expect(matchJoinCalls).toBe(2);
  });
});
