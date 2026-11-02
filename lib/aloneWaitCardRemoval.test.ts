import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("alone-wait confirm card removal", () => {
  it("does not render the alone-wait quit/extend card in CallClient", () => {
    const source = readFileSync(
      join(process.cwd(), "app/call/CallClient.tsx"),
      "utf8"
    );
    expect(source).not.toContain("まだ人が集まりません");
    expect(source).not.toContain("待機を続ける");
    expect(source).not.toContain("今回はやめますか");
    expect(source).not.toContain("quitAloneWaitAndGoHome");
    expect(source).not.toContain("extendAloneWait");
  });

  it("keeps LobbyWaitingPanel as a no-op", () => {
    const source = readFileSync(
      join(process.cwd(), "components/room/LobbyWaitingPanel.tsx"),
      "utf8"
    );
    expect(source).toContain("return null");
    expect(source).not.toContain("待機を続ける");
  });
});

describe("call connection banner removal", () => {
  it("does not render large reconnect/fatal cards in CallRoomView", () => {
    const source = readFileSync(
      join(process.cwd(), "app/call/CallRoomView.tsx"),
      "utf8"
    );
    expect(source).not.toContain("接続が不安定です。再接続しています");
    expect(source).not.toContain("音声接続に失敗しました");
    expect(source).not.toContain("音声が使えない可能性があります");
    expect(source).not.toMatch(/>\s*音声を再接続\s*</);
    expect(source).toContain("onStatusClick={onHeroStatusClick}");
    expect(source).toContain("resolveCallHeroConnectionState");
  });

  it("exposes tap-to-retry on the hero status chip", () => {
    const source = readFileSync(
      join(process.cwd(), "components/room/RoomSessionHero.tsx"),
      "utf8"
    );
    expect(source).toContain("onStatusClick");
    expect(source).toContain("タップで再接続");
  });
});
