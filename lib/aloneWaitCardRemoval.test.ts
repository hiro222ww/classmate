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
