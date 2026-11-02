import { describe, expect, it } from "vitest";
import {
  isSelfVisibleOnCallStrip,
  resolveCallHeroConnectionState,
} from "./callConnectionNotice";

describe("resolveCallHeroConnectionState", () => {
  it("defaults to in-call when healthy with peers", () => {
    expect(
      resolveCallHeroConnectionState({
        inCallCount: 2,
        hasCallActiveRemotes: true,
      })
    ).toEqual({
      statusLabel: "通話中",
      statusTone: "incall",
      statusActionable: false,
    });
  });

  it("shows waiting for healthy solo (not reconnect)", () => {
    expect(
      resolveCallHeroConnectionState({
        inCallCount: 1,
        hasCallActiveRemotes: false,
        showProlongedReconnectNotice: true,
        membersLocked: false,
      })
    ).toEqual({
      statusLabel: "待機中",
      statusTone: "waiting",
      statusActionable: false,
    });
  });

  it("shows recruiting chip when members are still open and 2+ present", () => {
    expect(
      resolveCallHeroConnectionState({
        membersLocked: false,
        inCallCount: 2,
        hasCallActiveRemotes: true,
      })
    ).toEqual({
      statusLabel: "募集中",
      statusTone: "waiting",
      statusActionable: false,
    });
  });

  it("shows reconnect only when call-active remotes exist", () => {
    expect(
      resolveCallHeroConnectionState({
        showProlongedReconnectNotice: true,
        hasCallActiveRemotes: true,
        inCallCount: 2,
        membersLocked: false,
      })
    ).toEqual({
      statusLabel: "再接続中",
      statusTone: "reconnect",
      statusActionable: true,
    });
    expect(
      resolveCallHeroConnectionState({
        voiceJoinFatalError: true,
        hasCallActiveRemotes: true,
        inCallCount: 2,
      })
    ).toEqual({
      statusLabel: "接続できません",
      statusTone: "error",
      statusActionable: true,
    });
  });
});

describe("isSelfVisibleOnCallStrip", () => {
  it("keeps self visible until explicit leave", () => {
    expect(
      isSelfVisibleOnCallStrip({
        memberId: "dev-1",
        viewerId: "dev-1",
        explicitLeft: false,
      })
    ).toBe(true);
    expect(
      isSelfVisibleOnCallStrip({
        memberId: "dev-1",
        viewerId: "dev-1",
        explicitLeft: true,
      })
    ).toBe(false);
    expect(
      isSelfVisibleOnCallStrip({
        memberId: "other",
        viewerId: "dev-1",
        explicitLeft: false,
      })
    ).toBe(false);
  });
});
