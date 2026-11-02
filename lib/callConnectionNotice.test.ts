import { describe, expect, it } from "vitest";
import { resolveCallHeroConnectionState } from "./callConnectionNotice";

describe("resolveCallHeroConnectionState", () => {
  it("defaults to in-call when healthy", () => {
    expect(resolveCallHeroConnectionState({})).toEqual({
      statusLabel: "通話中",
      statusTone: "incall",
      statusActionable: false,
    });
  });

  it("shows recruiting chip when members are still open", () => {
    expect(
      resolveCallHeroConnectionState({ membersLocked: false })
    ).toEqual({
      statusLabel: "募集中",
      statusTone: "waiting",
      statusActionable: false,
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
      statusLabel: "接続できません",
      statusTone: "error",
      statusActionable: true,
    });
    expect(
      resolveCallHeroConnectionState({
        showProlongedReconnectNotice: true,
        membersLocked: false,
      })
    ).toEqual({
      statusLabel: "再接続中",
      statusTone: "reconnect",
      statusActionable: true,
    });
  });
});
