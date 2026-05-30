/**
 * Shared helpers for WebRTC Playwright E2E (media mock hooks, log collection).
 */

import { sbFetch } from "./prelaunch-test-utils.mjs";

export const FORBIDDEN_ERROR_NAMES = new Set([
  "AbortError",
  "NotAllowedError",
  "InvalidStateError",
]);

/** Injected before navigation — hooks RTCPeerConnection + optional getUserMedia fallback. */
export const WEBRTC_INIT_SCRIPT = `
(() => {
  if (window.__webrtcTest) return;

  window.__webrtcTest = {
    logs: [],
    errors: [],
    peerStates: [],
    iceStates: [],
    remoteTracks: [],
  };

  const push = (type, payload) => {
    window.__webrtcTest.logs.push({ t: Date.now(), type, ...payload });
  };

  const recordError = (name, message, source) => {
    window.__webrtcTest.errors.push({
      t: Date.now(),
      name: String(name ?? "Error"),
      message: String(message ?? ""),
      source: String(source ?? ""),
    });
  };

  window.addEventListener("error", (event) => {
    recordError(event.error?.name ?? "Error", event.message, "window.error");
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    recordError(
      reason?.name ?? "UnhandledRejection",
      reason?.message ?? String(reason ?? ""),
      "unhandledrejection"
    );
  });

  const OrigPC = window.RTCPeerConnection;
  if (typeof OrigPC === "function") {
    const recordPcState = (pc) => {
      const cs = pc.connectionState;
      if (cs) {
        window.__webrtcTest.peerStates.push({ t: Date.now(), state: cs });
        push("connectionState", { state: cs });
      }
      const ice = pc.iceConnectionState;
      if (ice) {
        window.__webrtcTest.iceStates.push({ t: Date.now(), state: ice });
        push("iceConnectionState", { state: ice });
      }
    };

    window.RTCPeerConnection = function WebRtcTestPeerConnection(...args) {
      const pc = new OrigPC(...args);

      pc.addEventListener("connectionstatechange", () => {
        recordPcState(pc);
      });

      pc.addEventListener("iceconnectionstatechange", () => {
        recordPcState(pc);
      });

      pc.addEventListener("track", (event) => {
        const track = event.track;
        window.__webrtcTest.remoteTracks.push({
          t: Date.now(),
          trackId: track?.id ?? null,
          kind: track?.kind ?? null,
        });
        push("remoteTrack", {
          trackId: track?.id ?? null,
          kind: track?.kind ?? null,
        });
      });

      queueMicrotask(() => recordPcState(pc));

      return pc;
    };
    window.RTCPeerConnection.prototype = OrigPC.prototype;
  }

  if (navigator.mediaDevices) {
    const origEnum = navigator.mediaDevices.enumerateDevices?.bind(
      navigator.mediaDevices
    );
    navigator.mediaDevices.enumerateDevices = async () => {
      if (typeof origEnum === "function") {
        try {
          const devices = await origEnum();
          const inputs = devices.filter((d) => d.kind === "audioinput");
          if (inputs.length > 0) return devices;
        } catch {
          // fall through to mock device
        }
      }
      return [
        {
          deviceId: "mock-audio-input-1",
          kind: "audioinput",
          label: "Mock Audio Input",
          groupId: "mock-group",
        },
      ];
    };

    if (!navigator.mediaDevices.getUserMedia.__webrtcTestPatched) {
      const origGum = navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices
      );
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        try {
          return await origGum(constraints);
        } catch (e) {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          if (!Ctx) throw e;
          const ctx = new Ctx();
          const oscillator = ctx.createOscillator();
          const dst = ctx.createMediaStreamDestination();
          oscillator.connect(dst);
          oscillator.start();
          push("getUserMediaFallback", { reason: e?.name ?? "unknown" });
          return dst.stream;
        }
      };
      navigator.mediaDevices.getUserMedia.__webrtcTestPatched = true;
    }
  }
})();
`;

export function parseWebrtcArgs(argv = process.argv.slice(2)) {
  const get = (flag, fallback = null) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : fallback;
  };

  const apiBase = get("--api-base", process.env.API_BASE || "http://localhost:3000");
  const baseUrl = get("--base-url", process.env.BASE_URL || apiBase);
  const clientsRaw = Number(get("--clients", "3"));
  const clients = Math.min(5, Math.max(2, Number.isFinite(clientsRaw) ? clientsRaw : 3));

  return {
    apiBase,
    baseUrl,
    clients,
    headless: !argv.includes("--headed"),
    skipServerCheck: argv.includes("--skip-server-check"),
    timeoutMs: Number(get("--timeout", "120000")),
    envFile: get("--env-file", ".env.local"),
    supabaseUrl: get("--supabase-url", process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL),
    serviceKey: get("--service-key", process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
}

export function createWebRtcConsoleCollector(page, devKey) {
  const consoleLines = [];
  const forbiddenHits = [];

  const inspectText = (text, type) => {
    const line = `[dev=${devKey}] [${type}] ${text}`;
    consoleLines.push(line);

    for (const name of FORBIDDEN_ERROR_NAMES) {
      if (text.includes(name)) {
        forbiddenHits.push({ devKey, name, text, type });
      }
    }

    if (type === "error" || type === "warning") {
      console.log(line);
    }
  };

  page.on("console", (msg) => {
    inspectText(msg.text(), msg.type());
  });

  page.on("pageerror", (err) => {
    inspectText(err?.message ?? String(err), "pageerror");
    if (err?.name && FORBIDDEN_ERROR_NAMES.has(err.name)) {
      forbiddenHits.push({
        devKey,
        name: err.name,
        text: err.message,
        type: "pageerror",
      });
    }
  });

  return {
    consoleLines,
    forbiddenHits,
    summary() {
      return { consoleLines, forbiddenHits };
    },
  };
}

export async function waitForMicReady(page, timeoutMs) {
  await page.waitForFunction(
    () => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons.some(
        (b) =>
          !b.disabled &&
          (b.textContent?.includes("ミュート解除") || b.textContent?.includes("ミュート"))
      );
    },
    { timeout: timeoutMs }
  );
}

export async function waitForPeerMesh(page, minRemotePeers, timeoutMs) {
  await page.waitForFunction(
    ({ minRemotePeers: minPeers }) => {
      const test = window.__webrtcTest;
      if (!test) return false;

      const connectedCount = test.peerStates.filter((p) => p.state === "connected").length;
      const trackCount = test.remoteTracks.length;
      const iceConnected = test.iceStates.filter(
        (s) => s.state === "connected" || s.state === "completed"
      ).length;

      // App UI: remote member chip shows "接続中" when peerState === "connected"
      const body = document.body?.innerText ?? "";
      const uiConnected = (body.match(/接続中/g) || []).length;

      if (minPeers <= 0) return true;
      return (
        connectedCount >= minPeers ||
        trackCount >= minPeers ||
        iceConnected >= minPeers ||
        uiConnected >= minPeers
      );
    },
    { minRemotePeers },
    { timeout: timeoutMs }
  );
}

/** All clients wait in parallel — avoids sequential timeout while mesh is still forming. */
export async function waitForPeerMeshAll(pages, minRemotePeers, timeoutMs) {
  await Promise.all(
    pages.map(({ page }) => waitForPeerMesh(page, minRemotePeers, timeoutMs))
  );
}

export async function waitForMuteButtonLabel(page, label, timeoutMs = 15000) {
  await page
    .locator("button")
    .filter({ hasText: new RegExp(`^${label}$`) })
    .first()
    .waitFor({ state: "visible", timeout: timeoutMs });
}

export async function clickMuteToggle(page) {
  const btn = page.locator("button").filter({ hasText: /^ミュート解除$|^ミュート$/ }).first();
  await btn.click();
}

export async function waitForSelfUnmuted(page, timeoutMs = 15000) {
  await page.waitForFunction(
    () => {
      const text = document.body?.innerText ?? "";
      return (
        text.includes("自分 / 発話可能") ||
        text.includes("発話中") ||
        !!document.querySelector('button:not([disabled])')?.textContent?.match(/^ミュート$/)
      );
    },
    { timeout: timeoutMs }
  );
}

export async function waitForSelfMuted(page, timeoutMs = 15000) {
  await page.waitForFunction(
    () => {
      const text = document.body?.innerText ?? "";
      return (
        text.includes("自分 / ミュート中") ||
        !!document.querySelector('button:not([disabled])')?.textContent?.match(/^ミュート解除$/)
      );
    },
    { timeout: timeoutMs }
  );
}

export async function readWebRtcSnapshot(page) {
  return page.evaluate(() => {
    const t = window.__webrtcTest ?? {};
    return {
      peerStates: t.peerStates ?? [],
      iceStates: t.iceStates ?? [],
      remoteTracks: t.remoteTracks ?? [],
      errors: t.errors ?? [],
      logs: t.logs ?? [],
    };
  });
}

export function mergeForbiddenErrors(collectors, snapshots) {
  const hits = [];
  for (const c of collectors) {
    hits.push(...c.forbiddenHits);
  }
  for (const { devKey, snapshot } of snapshots) {
    for (const err of snapshot.errors ?? []) {
      if (FORBIDDEN_ERROR_NAMES.has(err.name)) {
        hits.push({
          devKey,
          name: err.name,
          text: err.message,
          type: "injected",
        });
      }
    }
  }
  return hits;
}

export function countConnectedPeers(snapshot) {
  return snapshot.peerStates.filter((p) => p.state === "connected").length;
}

/**
 * 入校時間外でも E2E を通す。global_join_window.enabled=false（常時 open）に一時変更し restore を返す。
 * test-device-* や本番ユーザーには触らない。
 */
export async function ensureE2eAdmissionOpen(apiBase, sbConfig) {
  const { url, key } = sbConfig;

  let admission = null;
  try {
    const res = await fetch(`${apiBase}/api/admission/status`, { cache: "no-store" });
    admission = await res.json().catch(() => null);
    if (admission?.open) {
      return { patched: false, restore: async () => {} };
    }
  } catch (e) {
    console.warn("[webrtc-e2e] admission status fetch failed", e?.message ?? e);
  }

  const rowRes = await sbFetch(
    url,
    key,
    "/rest/v1/app_settings?select=key,value&key=eq.global_join_window"
  );
  const original =
    rowRes.json?.[0]?.value && typeof rowRes.json[0].value === "object"
      ? rowRes.json[0].value
      : { enabled: true, start: "21:00", end: "21:30" };

  const patched = { ...original, enabled: false };

  const writeRes = await sbFetch(url, key, "/rest/v1/app_settings", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key: "global_join_window", value: patched }),
  });

  if (!writeRes.ok) {
    throw new Error(
      `failed to patch global_join_window for E2E: ${writeRes.status} ${writeRes.text}`
    );
  }

  console.log(
    "[webrtc-e2e] admission window temporarily disabled for E2E (will restore after run)"
  );

  return {
    patched: true,
    restore: async () => {
      await sbFetch(url, key, "/rest/v1/app_settings", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ key: "global_join_window", value: original }),
      });
      console.log("[webrtc-e2e] restored global_join_window");
    },
  };
}
