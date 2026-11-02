import { describe, expect, it, afterEach, vi } from "vitest";
import {
  buildCallExitHomeHref,
  buildCallExitWaitingRoomHref,
  navigateCallExit,
  navigateCallExitHome,
  shouldExitCallToWaitingRoom,
} from "./callExitNavigate";

describe("buildCallExitHomeHref", () => {
  it("appends hash after withDev so ?dev= stays on the path", () => {
    const href = buildCallExitHomeHref({
      dashboardPath: "/",
      sectionId: "cm-home-my-class",
      withDev: (path) => `${path}?dev=1`,
    });
    expect(href).toBe("/?dev=1#cm-home-my-class");
    expect(href).not.toMatch(/#.*\?/);
  });

  it("supports app shell dashboard path", () => {
    const href = buildCallExitHomeHref({
      dashboardPath: "/app/home",
      sectionId: "cm-home-my-class",
      withDev: (path) => path,
    });
    expect(href).toBe("/app/home#cm-home-my-class");
  });
});

describe("buildCallExitWaitingRoomHref", () => {
  it("builds /room with autojoin=0 and openJoinedClass=1", () => {
    const href = buildCallExitWaitingRoomHref({
      classId: "class-a",
      sessionId: "session-a",
      withDev: (path) => path,
    });
    expect(href).toContain("/room?");
    expect(href).toContain("autojoin=0");
    expect(href).toContain("classId=class-a");
    expect(href).toContain("sessionId=session-a");
    expect(href).toContain("openJoinedClass=1");
  });

  it("keeps ?dev= on the path via withDev", () => {
    const href = buildCallExitWaitingRoomHref({
      classId: "c1",
      sessionId: "s1",
      withDev: (path) => `${path}${path.includes("?") ? "&" : "?"}dev=1`,
    });
    expect(href).toMatch(/[?&]dev=1/);
    expect(href).toContain("autojoin=0");
  });
});

describe("shouldExitCallToWaitingRoom", () => {
  it("routes official class to waiting room", () => {
    expect(
      shouldExitCallToWaitingRoom({
        classId: "class-a",
        lifecycle: "official",
      })
    ).toBe(true);
  });

  it("keeps provisional/random on home exit", () => {
    expect(
      shouldExitCallToWaitingRoom({
        classId: "class-a",
        lifecycle: "provisional",
      })
    ).toBe(false);
  });

  it("routes My Class openJoinedClass even before lifecycle loads", () => {
    expect(
      shouldExitCallToWaitingRoom({
        classId: "class-a",
        lifecycle: null,
        openJoinedClass: true,
      })
    ).toBe(true);
  });

  it("keeps unknown lifecycle without openJoinedClass on home (random-safe)", () => {
    expect(
      shouldExitCallToWaitingRoom({
        classId: "class-a",
        lifecycle: null,
        openJoinedClass: false,
      })
    ).toBe(false);
  });

  it("requires classId", () => {
    expect(
      shouldExitCallToWaitingRoom({
        classId: "",
        lifecycle: "official",
        openJoinedClass: true,
      })
    ).toBe(false);
  });
});

describe("navigateCallExit", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses location.assign (hard navigation)", () => {
    const assign = vi.fn();
    vi.stubGlobal("window", {
      location: { assign, href: "" },
    });
    navigateCallExit("/room?autojoin=0&classId=c1&sessionId=s1&openJoinedClass=1");
    expect(assign).toHaveBeenCalledWith(
      "/room?autojoin=0&classId=c1&sessionId=s1&openJoinedClass=1"
    );
  });

  it("falls back to location.href when assign throws", () => {
    const loc: { assign: () => void; href: string } = {
      assign: () => {
        throw new Error("assign blocked");
      },
      href: "",
    };
    vi.stubGlobal("window", { location: loc });
    navigateCallExitHome("/app/home#cm-home-my-class");
    expect(loc.href).toBe("/app/home#cm-home-my-class");
  });
});
