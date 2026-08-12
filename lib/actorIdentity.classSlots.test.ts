import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const lookupEntitlements = vi.fn();

vi.mock("@/lib/userIdentityMigration", () => ({
  lookupEntitlements: (...args: unknown[]) => lookupEntitlements(...args),
  resolveUserIdForDevice: vi.fn(),
}));

describe("class slot entitlement vs billing availability", () => {
  beforeEach(() => {
    vi.resetModules();
    lookupEntitlements.mockReset();
  });

  it("resolveClassSlotLimitFromEntitlement defaults Free=1 and keeps 3/5", async () => {
    const { resolveClassSlotLimitFromEntitlement } = await import(
      "@/lib/actorIdentity"
    );
    expect(resolveClassSlotLimitFromEntitlement(undefined)).toBe(1);
    expect(resolveClassSlotLimitFromEntitlement(null)).toBe(1);
    expect(resolveClassSlotLimitFromEntitlement(0)).toBe(1);
    expect(resolveClassSlotLimitFromEntitlement(1)).toBe(1);
    expect(resolveClassSlotLimitFromEntitlement(3)).toBe(3);
    expect(resolveClassSlotLimitFromEntitlement(5)).toBe(5);
  });

  it("getClassSlotsForActor uses entitlements and ignores billing-off 999", async () => {
    lookupEntitlements.mockResolvedValue({ class_slots: 3 });
    const { getClassSlotsForActor } = await import("@/lib/actorIdentity");
    const { SLOT_BILLING_OFF_EFFECTIVE_LIMIT } = await import(
      "@/lib/billingAvailability"
    );

    const res = await getClassSlotsForActor({} as never, {
      deviceId: "device-a",
      userId: null,
    });

    expect(res).toEqual({ ok: true, classSlots: 3 });
    expect(res.ok && res.classSlots).not.toBe(SLOT_BILLING_OFF_EFFECTIVE_LIMIT);
    expect(lookupEntitlements).toHaveBeenCalledWith({
      userId: null,
      deviceId: "device-a",
    });
  });

  it("getClassSlotsForActor defaults Free=1 when entitlements missing", async () => {
    lookupEntitlements.mockResolvedValue(null);
    const { getClassSlotsForActor } = await import("@/lib/actorIdentity");

    const res = await getClassSlotsForActor({} as never, {
      deviceId: "device-free",
      userId: null,
    });

    expect(res).toEqual({ ok: true, classSlots: 1 });
  });

  it("keeps existing 5-slot entitlement", async () => {
    lookupEntitlements.mockResolvedValue({ class_slots: 5 });
    const { getClassSlotsForActor } = await import("@/lib/actorIdentity");

    const res = await getClassSlotsForActor({} as never, {
      deviceId: "device-5",
      userId: "11111111-2222-4333-8444-555555555555",
    });

    expect(res).toEqual({ ok: true, classSlots: 5 });
  });
});

describe("shared class slot limit across join surfaces", () => {
  it("join / quick-join / invite / match-join / RPC all resolve slots via shared helpers", () => {
    const root = process.cwd();
    const files = [
      "app/api/class/join/route.ts",
      "app/api/class/quick-join/route.ts",
      "lib/joinByInvite.ts",
      "lib/matchJoinV2.ts",
      "app/api/session/join/route.ts",
      "lib/matchJoinAtomicV3.ts",
      "lib/classMembershipSlots.ts",
    ];

    const sources = files.map((rel) => ({
      rel,
      src: readFileSync(join(root, rel), "utf8"),
    }));

    // HTTP join surfaces and invite/match helpers must not invent their own limit.
    for (const { rel, src } of sources.filter((f) =>
      [
        "app/api/class/join/route.ts",
        "app/api/class/quick-join/route.ts",
        "lib/matchJoinV2.ts",
      ].includes(f.rel)
    )) {
      expect(src, rel).toMatch(/getClassSlotsForActor|evaluateClassSlotsLimit/);
      expect(src, rel).not.toMatch(/SLOT_BILLING_OFF_EFFECTIVE_LIMIT/);
      expect(src, rel).not.toMatch(/classSlots:\s*999/);
    }

    expect(sources.find((f) => f.rel === "lib/joinByInvite.ts")?.src).toMatch(
      /evaluateClassSlotsLimit/
    );
    expect(
      sources.find((f) => f.rel === "app/api/session/join/route.ts")?.src
    ).toMatch(/evaluateClassSlotsLimit/);
    expect(
      sources.find((f) => f.rel === "lib/classMembershipSlots.ts")?.src
    ).toMatch(/getClassSlotsForActor/);

    // RPC receives the same numeric limit from callers (p_class_slots).
    expect(
      sources.find((f) => f.rel === "lib/matchJoinAtomicV3.ts")?.src
    ).toMatch(/p_class_slots:\s*params\.classSlots/);
    expect(
      sources.find((f) => f.rel === "lib/matchJoinV2.ts")?.src
    ).toMatch(/callMatchJoinAtomicV3|classSlots/);
  });

  it("evaluateClassSlotsLimit rejects at entitlement limit (billing-independent)", async () => {
    lookupEntitlements.mockResolvedValue({ class_slots: 1 });

    vi.doMock("@/lib/activeClassMemberships", () => ({
      fetchActiveClassMemberships: vi.fn(async () => ({
        ok: true,
        rows: [
          {
            classId: "class-1",
            membershipId: "m1",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      })),
      buildActiveMembershipSnapshot: vi.fn((rows: unknown[]) => ({
        totalCount: rows.length,
        billableCount: rows.length,
        legacyCount: 0,
        billableClassIds: ["class-1"],
        legacyClassIds: [],
      })),
      getActiveMembershipSnapshot: vi.fn(),
      getBillableMembershipSnapshot: vi.fn(),
      logHomeClassSlotsSnapshot: vi.fn(),
      resolveHomeVisibleBillableClassIds: vi.fn(() => ({
        visibleClassIds: ["class-1"],
        slotCountClassIds: ["class-1"],
        excludedReasons: [],
      })),
    }));

    vi.resetModules();
    const { evaluateClassSlotsLimit } = await import(
      "@/lib/classMembershipSlots"
    );

    const res = await evaluateClassSlotsLimit({} as never, "device-limit", {
      joiningClassId: "class-new",
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.allowed).toBe(false);
    if (res.allowed) return;
    expect(res.reason).toBe("class_slots_limit");
    expect(res.context.slotLimit).toBe(1);
    expect(res.context.slotLimit).not.toBe(999);
  });
});
