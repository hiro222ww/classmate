import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:3000";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  let matchJoinStatus = null;
  let matchJoinOk = null;
  let sessionJoinStatus = null;
  let sessionJoinOk = null;

  page.on("response", async (response) => {
    const url = response.url();
    try {
      if (url.includes("/api/class/match-join-v2") && response.request().method() === "POST") {
        matchJoinStatus = response.status();
        const json = await response.json();
        matchJoinOk = json?.ok === true;
        console.log("[match-join-v2]", matchJoinStatus, json?.classId, json?.sessionId, json?.error ?? "ok");
      }
      if (url.includes("/api/session/join") && response.request().method() === "POST") {
        sessionJoinStatus = response.status();
        const json = await response.json();
        sessionJoinOk = json?.ok === true;
        console.log("[session/join]", sessionJoinStatus, json?.error ?? "ok");
      }
    } catch {
      // ignore body read races
    }
  });

  console.log("1) Open /class/select?dev=1");
  await page.goto(`${BASE}/class/select?dev=1`, { waitUntil: "networkidle" });

  await page.waitForFunction(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    return buttons.some((b) => b.textContent?.trim() === "入る" && !b.disabled);
  }, { timeout: 30000 });

  const enterButtons = page.locator("button", { hasText: /^入る$/ });
  const count = await enterButtons.count();
  console.log(`2) Found ${count} enabled 入る button(s)`);

  console.log("3) Click first 入る and wait for room");
  await Promise.all([
    page.waitForURL(/\/room/, { timeout: 30000 }),
    enterButtons.first().click(),
  ]);

  const roomUrl = page.url();
  console.log("   room URL:", roomUrl);

  if (!roomUrl.includes("sessionId=") || !roomUrl.includes("classId=")) {
    throw new Error(`Room URL missing ids: ${roomUrl}`);
  }

  await page.waitForFunction(
    () =>
      typeof window !== "undefined" &&
      document.body?.innerText &&
      !document.body.innerText.includes("sessionId required"),
    { timeout: 30000 }
  );

  // Give session/join a moment if it hasn't fired yet
  await page.waitForTimeout(3000);

  if (sessionJoinStatus !== 200 || !sessionJoinOk) {
    throw new Error(`session/join failed: status=${sessionJoinStatus} ok=${sessionJoinOk}`);
  }

  if (matchJoinOk === false) {
    throw new Error(`match-join-v2 returned ok=false (status=${matchJoinStatus})`);
  }

  const bodyText = await page.locator("body").innerText();
  const bad = [
    "match_join_atomic_failed",
    "session_member_upsert_failed",
    "match_join_failed",
    "classId required",
  ].filter((s) => bodyText.includes(s));

  await browser.close();

  if (bad.length) {
    throw new Error(`Room page contains errors: ${bad.join(", ")}`);
  }

  console.log("SUCCESS: 入る -> /room 遷移を確認しました");
}

main().catch((e) => {
  console.error("E2E FAILED:", e?.message ?? e);
  process.exit(1);
});
