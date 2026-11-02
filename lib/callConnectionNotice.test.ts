import { describe, expect, it } from "vitest";
import { resolveCallHeroConnectionState } from "./callConnectionNotice";

describe("resolveCallHeroConnectionState", () => {
  it("defaults to in-call when healthy", () => {
    expect(resolveCallHeroConnectionState({})).toEqual({
      statusLabel: "通話中",
      statusTone: "incall",
    });
  });

  it("shows recruiting chip when members are still open", () => {
    expect(
      resolveCallHeroConnectionState({ membersLocked: false })
    ).toEqual({
      statusLabel: "募集中",
      statusTone: "waiting",
    });
  });

  it("prefers fatal and prolonged reconnect over recruiting", () => {
    expect(
      resolveCallHeroConnectionState({
        voiceJoinFatalError: true,
        showProlongedReconnectNotice: true,
        membersLocked: false,
      })
    ).toEqual({
      statusLabel: "接続エラー",
      statusTone: "error",
    });
    expect(
      resolveCallHeroConnectionState({
        showProlongedReconnectNotice: true,
        membersLocked: false,
      })
    ).toEqual({
      statusLabel: "再接続中",
      statusTone: "reconnect",
    });
  });
});
