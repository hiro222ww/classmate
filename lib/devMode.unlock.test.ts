import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("unlockAdmin (server-side login)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    // jsdom-less: stub browser locals
    const store = new Map<string, string>();
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
  });

  it("does not embed NEXT_PUBLIC_ADMIN_PASSWORD in the unlock path", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("./devMode.ts", import.meta.url), "utf8")
    );
    expect(src).not.toMatch(/NEXT_PUBLIC_ADMIN_PASSWORD/);
    expect(src).toMatch(/\/api\/admin\/login/);
  });

  it("sets local unlock flag only when login API returns ok", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    ) as typeof fetch;

    const { unlockAdmin, isAdminUnlocked } = await import("./devMode");
    const ok = await unlockAdmin("secret");
    expect(ok).toBe(true);
    expect(isAdminUnlocked()).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/admin/login",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("rejects when login API fails", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false }), { status: 401 })
    ) as typeof fetch;

    const { unlockAdmin, isAdminUnlocked, lockAdmin } = await import("./devMode");
    lockAdmin();
    const ok = await unlockAdmin("wrong");
    expect(ok).toBe(false);
    expect(isAdminUnlocked()).toBe(false);
  });
});
