import { describe, expect, it } from "vitest";
import {
  diffCallPresenceToasts,
  shouldIncludeMemberInCallGrid,
} from "./callPresenceToasts";
import { shouldShowNotificationSoftAsk } from "./notificationPrompt";

describe("callPresenceToasts", () => {
  it("does not emit on first prime", () => {
    const result = diffCallPresenceToasts({
      previousIds: new Set(),
      nextIds: new Set(["a", "b"]),
      primed: false,
      selfDeviceId: "me",
      nameById: new Map([
        ["a", "A"],
        ["b", "B"],
      ]),
      recentKeys: new Set(),
    });
    expect(result.primed).toBe(true);
    expect(result.toasts).toEqual([]);
  });

  it("emits join/leave without self and dedupes", () => {
    const first = diffCallPresenceToasts({
      previousIds: new Set(["a"]),
      nextIds: new Set(["a", "b"]),
      primed: true,
      selfDeviceId: "me",
      nameById: new Map([
        ["a", "A"],
        ["b", "B"],
        ["me", "Me"],
      ]),
      recentKeys: new Set(),
      now: 1000,
    });
    expect(first.toasts.map((t) => t.message)).toEqual([
      "Bさんが通話に参加しました",
    ]);

    const second = diffCallPresenceToasts({
      previousIds: first.nextPreviousIds,
      nextIds: new Set(["b"]),
      primed: true,
      selfDeviceId: "me",
      nameById: new Map([
        ["a", "A"],
        ["b", "B"],
      ]),
      recentKeys: first.nextRecentKeys,
      now: 2000,
    });
    expect(second.toasts.map((t) => t.message)).toEqual([
      "Aさんが通話から退出しました",
    ]);
  });

  it("keeps only in-call / grace members in grid", () => {
    expect(
      shouldIncludeMemberInCallGrid({
        priority: "in_call",
        recentlyDepartedUntilMs: null,
        nowMs: 1,
      })
    ).toBe(true);
    expect(
      shouldIncludeMemberInCallGrid({
        priority: "absent_grace",
        recentlyDepartedUntilMs: null,
        nowMs: 1,
      })
    ).toBe(false);
    expect(
      shouldIncludeMemberInCallGrid({
        priority: "explicit_left",
        recentlyDepartedUntilMs: 50,
        nowMs: 40,
      })
    ).toBe(false);
    expect(
      shouldIncludeMemberInCallGrid({
        priority: "presence_stale_grace",
        recentlyDepartedUntilMs: null,
        nowMs: 1,
        isInCall: true,
      })
    ).toBe(true);
    expect(
      shouldIncludeMemberInCallGrid({
        priority: "presence_stale_grace",
        recentlyDepartedUntilMs: null,
        nowMs: 1,
        isInCall: false,
      })
    ).toBe(false);
  });
});

describe("notificationPrompt", () => {
  it("shows only for default permission and eligible clients", () => {
    expect(
      shouldShowNotificationSoftAsk({
        isLineInAppBrowser: false,
        isNativeApp: false,
        permission: "default",
        canUsePush: true,
      })
    ).toBe(true);

    expect(
      shouldShowNotificationSoftAsk({
        isLineInAppBrowser: true,
        isNativeApp: false,
        permission: "default",
        canUsePush: true,
      })
    ).toBe(false);

    expect(
      shouldShowNotificationSoftAsk({
        isLineInAppBrowser: false,
        isNativeApp: false,
        permission: "denied",
        canUsePush: true,
      })
    ).toBe(false);

    expect(
      shouldShowNotificationSoftAsk({
        isLineInAppBrowser: false,
        isNativeApp: false,
        permission: "default",
        canUsePush: true,
        deferredUntil: Date.now() + 60_000,
        now: Date.now(),
      })
    ).toBe(false);
  });
});
