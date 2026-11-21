import { describe, expect, it } from "vitest";
import { isDiscordWebhookConfigured } from "@/lib/marketing/discordWebhook";

describe("isDiscordWebhookConfigured", () => {
  it("accepts discord.com webhook urls", () => {
    expect(
      isDiscordWebhookConfigured(
        "https://discord.com/api/webhooks/123/abc-def"
      )
    ).toBe(true);
  });

  it("rejects non-webhook urls", () => {
    expect(isDiscordWebhookConfigured("https://example.com/hook")).toBe(false);
    expect(isDiscordWebhookConfigured("")).toBe(false);
  });
});
