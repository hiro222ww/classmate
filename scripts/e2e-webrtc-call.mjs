#!/usr/bin/env node
/**
 * WebRTC call E2E — 2–5 Playwright clients on the same session/call.
 *
 * Uses isolated device IDs: webrtc-test-device-1..N (?dev=webrtc1)
 * Does NOT touch test-device-* or real users.
 *
 * Prerequisites:
 *   - App running (default http://localhost:3000) with NEXT_PUBLIC_DEV_MODE=true
 *   - Supabase credentials in .env.local
 *   - playwright + chromium: npm i -D playwright && npx playwright install chromium
 *
 * Usage:
 *   node scripts/e2e-webrtc-call.mjs
 *   node scripts/e2e-webrtc-call.mjs --clients 5 --headed
 */
import { chromium } from "playwright";
import {
  apiMatchJoin,
  apiSessionJoin,
  cleanupWebrtcE2eDeviceState,
  createReporter,
  ensureDevDevices,
  logJoinResult,
  resolveSupabaseConfig,
  webrtcDevParam,
  webrtcTestDeviceId,
} from "./lib/prelaunch-test-utils.mjs";
import {
  WEBRTC_INIT_SCRIPT,
  clickMuteToggle,
  countConnectedPeers,
  createWebRtcConsoleCollector,
  ensureE2eAdmissionOpen,
  mergeForbiddenErrors,
  parseWebrtcArgs,
  readWebRtcSnapshot,
  waitForMicReady,
  waitForPeerMesh,
  waitForPeerMeshAll,
  waitForSelfMuted,
  waitForSelfUnmuted,
} from "./lib/webrtc-test-utils.mjs";

const opts = parseWebrtcArgs();
const report = createReporter("webrtc-call");
const sb = resolveSupabaseConfig(opts);
const clientKeys = Array.from({ length: opts.clients }, (_, i) => String(i + 1));
const minRemotePeers = opts.clients - 1;

if (!sb.url || !sb.key) {
  console.error("Missing Supabase URL or SUPABASE_SERVICE_ROLE_KEY (.env.local)");
  process.exit(1);
}

report.info(
  `\n=== WebRTC call E2E clients=${opts.clients} devices=webrtc-test-device-* base=${opts.baseUrl} ===`
);

try {
  if (!opts.skipServerCheck) {
    const probe = await fetch(opts.baseUrl, {
      method: "GET",
      signal: AbortSignal.timeout(8000),
    });
    if (!probe.ok && probe.status >= 500) {
      report.fail("server reachable", `${opts.baseUrl} returned ${probe.status}`);
      process.exit(report.summary());
    }
  }
} catch (e) {
  report.fail(
    "server reachable",
    `${opts.baseUrl} — ${e?.message ?? e}\n(start \`npm run dev\` or pass --skip-server-check)`
  );
  process.exit(report.summary());
}

let admissionRestore = async () => {};

try {
  const admission = await ensureE2eAdmissionOpen(opts.apiBase, sb);
  admissionRestore = admission.restore;
  if (admission.patched) {
    report.pass("admission prep", "global_join_window temporarily disabled for E2E");
  } else {
    report.pass("admission prep", "already open");
  }

  report.info("\n--- cleanup webrtc-test-device-* state ---");
  await cleanupWebrtcE2eDeviceState(sb, sb, clientKeys);
  report.pass(
    "webrtc device cleanup",
    clientKeys.map(webrtcTestDeviceId).join(", ")
  );

  await ensureDevDevices(sb, sb, clientKeys, 10, {
    deviceIdFn: webrtcTestDeviceId,
    displayNamePrefix: "WebRTC-E2E",
  });
  report.pass("ensure webrtc test profiles + entitlements");

  const leaderDeviceId = webrtcTestDeviceId("1");
  const match = await apiMatchJoin(opts.apiBase, {
    deviceId: leaderDeviceId,
    worldKey: "default",
    topicKey: null,
    capacity: 5,
  });
  logJoinResult("webrtc:match", leaderDeviceId, match);

  let classId = "";
  let sessionId = "";

  if (match.status === 200 && match.json?.ok) {
    classId = String(match.json.classId ?? "");
    sessionId = String(match.json.sessionId ?? "");
  } else if (match.json?.error === "class_slots_limit") {
    report.fail(
      "match-join setup",
      `class_slots_limit for ${leaderDeviceId} — cleanup may have failed`
    );
    process.exit(report.summary());
  } else if (match.json?.error === "admission_closed") {
    report.fail(
      "match-join setup",
      "admission_closed after E2E prep — check app_settings.global_join_window restore"
    );
    process.exit(report.summary());
  } else {
    report.fail("match-join setup", JSON.stringify(match.json));
    process.exit(report.summary());
  }

  if (!classId || !sessionId) {
    report.fail("match-join ids", "missing classId or sessionId");
    process.exit(report.summary());
  }

  report.pass("match-join created session", `${classId} / ${sessionId}`);

  for (const devKey of clientKeys) {
    const deviceId = webrtcTestDeviceId(devKey);
    const join = await apiSessionJoin(opts.apiBase, {
      deviceId,
      sessionId,
      classId,
    });
    logJoinResult(`webrtc:session-join:${devKey}`, deviceId, join);
    if (join.status !== 200 || !join.json?.ok) {
      report.fail(`session/join dev=${devKey}`, JSON.stringify(join.json));
      process.exit(report.summary());
    }
  }
  report.pass("session/join all clients", clientKeys.map(webrtcTestDeviceId).join(", "));

  const browser = await chromium.launch({
    headless: opts.headless,
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  const pages = [];
  const collectors = [];

  try {
    for (const devKey of clientKeys) {
      const context = await browser.newContext({
        baseURL: opts.baseUrl,
        ignoreHTTPSErrors: true,
      });
      await context.grantPermissions(["microphone"], { origin: opts.baseUrl });
      await context.addInitScript({ content: WEBRTC_INIT_SCRIPT });

      const page = await context.newPage();
      const devParam = webrtcDevParam(devKey);
      const collector = createWebRtcConsoleCollector(page, devParam);
      collectors.push(collector);
      pages.push({ devKey, devParam, page, collector });
    }

    report.info("\n--- navigate all clients to /call ---");
    await Promise.all(
      pages.map(async ({ devKey, devParam, page }) => {
        const url =
          `/call?classId=${encodeURIComponent(classId)}` +
          `&sessionId=${encodeURIComponent(sessionId)}` +
          `&dev=${encodeURIComponent(devParam)}`;
        console.log(`[${webrtcTestDeviceId(devKey)}] goto ${url}`);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: opts.timeoutMs });
      })
    );

    report.info("\n--- wait micReady ---");
    for (const { devKey, page } of pages) {
      try {
        await waitForMicReady(page, opts.timeoutMs);
        report.pass(`${webrtcTestDeviceId(devKey)} micReady`);
      } catch (e) {
        report.fail(`${webrtcTestDeviceId(devKey)} micReady`, e?.message ?? String(e));
      }
    }

    report.info("\n--- wait peer mesh (parallel) ---");
    try {
      await waitForPeerMeshAll(pages, minRemotePeers, opts.timeoutMs);
      for (const { devKey, page } of pages) {
        const snap = await readWebRtcSnapshot(page);
        report.pass(
          `${webrtcTestDeviceId(devKey)} peer mesh`,
          `connected=${countConnectedPeers(snap)} remoteTracks=${snap.remoteTracks.length} ice=${snap.iceStates.length}`
        );
      }
    } catch (e) {
      for (const { devKey, page } of pages) {
        const snap = await readWebRtcSnapshot(page);
        const connected = countConnectedPeers(snap);
        const tracks = snap.remoteTracks.length;
        if (connected >= minRemotePeers || tracks >= minRemotePeers) {
          report.pass(
            `${webrtcTestDeviceId(devKey)} peer mesh (late)`,
            `connected=${connected} remoteTracks=${tracks}`
          );
        } else {
          report.fail(
            `${webrtcTestDeviceId(devKey)} peer mesh`,
            `${e?.message ?? String(e)} snapshot connected=${connected} tracks=${tracks}`
          );
        }
      }
    }

    report.info("\n--- mute / unmute (webrtc-test-device-1) ---");
    const leader = pages.find((p) => p.devKey === "1");
    if (leader) {
      try {
        await clickMuteToggle(leader.page);
        await waitForSelfUnmuted(leader.page);
        report.pass("webrtc-test-device-1 unmute");

        await clickMuteToggle(leader.page);
        await waitForSelfMuted(leader.page);
        report.pass("webrtc-test-device-1 mute again");
      } catch (e) {
        report.fail("webrtc-test-device-1 mute/unmute", e?.message ?? String(e));
      }
    }

    report.info("\n--- reload recovery (webrtc-test-device-1) ---");
    if (leader) {
      try {
        await leader.page.reload({ waitUntil: "domcontentloaded" });
        await waitForMicReady(leader.page, opts.timeoutMs);
        await waitForPeerMesh(leader.page, Math.max(1, minRemotePeers), opts.timeoutMs);
        const snap = await readWebRtcSnapshot(leader.page);
        report.pass(
          "webrtc-test-device-1 reload recovery",
          `connected=${countConnectedPeers(snap)} tracks=${snap.remoteTracks.length}`
        );
      } catch (e) {
        report.fail("webrtc-test-device-1 reload recovery", e?.message ?? String(e));
      }
    }

    report.info("\n--- console / forbidden errors ---");
    const snapshots = [];
    for (const { devKey, page } of pages) {
      snapshots.push({ devKey, snapshot: await readWebRtcSnapshot(page) });
    }

    const forbidden = mergeForbiddenErrors(collectors, snapshots);
    const consoleErrors = collectors.flatMap((c) =>
      c.consoleLines.filter((l) => l.includes("[error]") || l.includes("[pageerror]"))
    );

    if (forbidden.length === 0) {
      report.pass("no AbortError / NotAllowedError / InvalidStateError");
    } else {
      report.fail(
        "forbidden WebRTC errors",
        forbidden.map((f) => `dev=${f.devKey} ${f.name}: ${f.text}`).join("\n")
      );
    }

    if (consoleErrors.length === 0) {
      report.pass("no console.error collected");
    } else {
      const critical = consoleErrors.filter(
        (l) =>
          l.includes("[local-mic] mic error") ||
          l.includes("create offer error") ||
          l.includes("signal handle error")
      );
      if (critical.length > 0) {
        report.fail("critical console errors", critical.join("\n"));
      } else {
        report.pass("console errors non-critical", `${consoleErrors.length} logged`);
      }
    }
  } finally {
    await browser.close();
  }
} finally {
  await admissionRestore().catch((e) => {
    console.error("[webrtc-e2e] failed to restore admission window", e?.message ?? e);
  });
}

report.info("\nManual checks: docs/WEBRTC_PRELAUNCH.md");
process.exit(report.summary());
