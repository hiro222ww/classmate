import { afterEach, describe, expect, it } from "vitest";
import {
  getBufferConnectionStatus,
  isBufferPublishEnabled,
  isBufferTokenPresent,
} from "@/lib/marketing/bufferConfig";

const keys = [
  "BUFFER_ACCESS_TOKEN",
  "BUFFER_API_KEY",
  "BUFFER_CHANNEL_ID",
  "MARKETING_BUFFER_PUBLISH_ENABLED",
] as const;

afterEach(() => {
  for (const k of keys) delete process.env[k];
});

describe("bufferConfig", () => {
  it("stays disconnected without credentials", () => {
    const status = getBufferConnectionStatus();
    expect(status.connected).toBe(false);
    expect(status.tokenPresent).toBe(false);
    expect(status.credentialsPresent).toBe(false);
    expect(isBufferPublishEnabled()).toBe(false);
  });

  it("recognizes token-only before channel id", () => {
    process.env.BUFFER_ACCESS_TOKEN = "tok";
    expect(isBufferTokenPresent()).toBe(true);
    const status = getBufferConnectionStatus();
    expect(status.tokenPresent).toBe(true);
    expect(status.credentialsPresent).toBe(false);
    expect(status.connected).toBe(false);
  });

  it("requires explicit publish gate even with tokens", () => {
    process.env.BUFFER_ACCESS_TOKEN = "tok";
    process.env.BUFFER_CHANNEL_ID = "ch_1";
    expect(getBufferConnectionStatus().credentialsPresent).toBe(true);
    expect(getBufferConnectionStatus().connected).toBe(false);

    process.env.MARKETING_BUFFER_PUBLISH_ENABLED = "1";
    expect(getBufferConnectionStatus().connected).toBe(true);
  });
});
