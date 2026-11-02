import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  buildCallExitHomeHref,
  navigateCallExitHome,
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

describe("navigateCallExitHome", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses location.assign (hard navigation)", () => {
    const assign = vi.fn();
    vi.stubGlobal("window", {
      location: { assign, href: "" },
    });
    navigateCallExitHome("/#cm-home-my-class");
    expect(assign).toHaveBeenCalledWith("/#cm-home-my-class");
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
