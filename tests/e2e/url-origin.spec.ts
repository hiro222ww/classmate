import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  buildAppUrl,
  buildInviteRoomUrl,
  getAppOrigin,
} from "@/lib/appOrigin";

const CANONICAL = "https://classmate-room.com";

test.describe("URL正規化（lib/appOrigin）", () => {
  test("env 設定時 invite URL は classmate-room.com", () => {
    const prevOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN;
    const prevUrl = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_ORIGIN = CANONICAL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;

    const url = buildInviteRoomUrl({
      classId: "class-11111111-1111-4111-8111-111111111111",
      sessionId: "sess-22222222-2222-4222-8222-222222222222",
    });

    expect(url).toMatch(/^https:\/\/classmate-room\.com\/room\?/);
    expect(url).not.toContain("vercel.app");

    process.env.NEXT_PUBLIC_APP_ORIGIN = prevOrigin;
    process.env.NEXT_PUBLIC_APP_URL = prevUrl;
  });

  test("getAppOrigin は env を優先（client 模擬）", () => {
    const prev = process.env.NEXT_PUBLIC_APP_ORIGIN;
    process.env.NEXT_PUBLIC_APP_ORIGIN = CANONICAL;
    expect(getAppOrigin()).toBe(CANONICAL);
    process.env.NEXT_PUBLIC_APP_ORIGIN = prev;
  });

  test("buildAppUrl は vercel.app を含まない", () => {
    const prev = process.env.NEXT_PUBLIC_APP_ORIGIN;
    process.env.NEXT_PUBLIC_APP_ORIGIN = CANONICAL;
    expect(buildAppUrl("/call?sessionId=abc")).toBe(
      `${CANONICAL}/call?sessionId=abc`
    );
    process.env.NEXT_PUBLIC_APP_ORIGIN = prev;
  });
});

test.describe("共有URLコード静的チェック", () => {
  const ROOT = process.cwd();
  const SCAN_DIRS = ["app", "components", "lib"];
  const ALLOW_VERCEL = new Set([
    "lib/appOrigin.ts",
    "lib/appOrigin.test.ts",
    "lib/deviceIdValidation.test.ts",
  ]);

  test("ユーザー向けURL生成に vercel.app ハードコードがない", () => {
    const offenders: string[] = [];

    for (const dir of SCAN_DIRS) {
      walk(path.join(ROOT, dir), (file) => {
        const rel = path.relative(ROOT, file).replace(/\\/g, "/");
        if (ALLOW_VERCEL.has(rel)) return;
        if (!/\.(ts|tsx)$/.test(file)) return;
        const text = fs.readFileSync(file, "utf8");
        if (text.includes("vercel.app") && !text.includes("readPreviewServerOrigin")) {
          offenders.push(rel);
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  test("CallClient / RoomClient の招待URLは buildInviteRoomUrl を使用", () => {
    const callClient = fs.readFileSync(
      path.join(ROOT, "app/call/CallClient.tsx"),
      "utf8"
    );
    const roomClient = fs.readFileSync(
      path.join(ROOT, "app/room/RoomClient.tsx"),
      "utf8"
    );
    expect(callClient).toContain("buildInviteRoomUrl");
    expect(roomClient).toContain("buildInviteRoomUrl");
    expect(callClient).not.toContain("window.location.origin");
    expect(roomClient).not.toMatch(/location\.origin.*invite/);
  });
});

function walk(dir: string, visit: (file: string) => void) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(full, visit);
    } else {
      visit(full);
    }
  }
}
