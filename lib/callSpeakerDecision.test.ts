import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guardrail: the call dock must not show a cosmetic "スピーカー" control.
 * Investigation found it only flipped HTMLAudioElement.volume (not output
 * device / setSinkId), which is unreliable on iOS Safari.
 */
describe("call dock speaker control removal", () => {
  it("does not render a speaker dock button in CallRoomView", () => {
    const source = readFileSync(
      join(process.cwd(), "app/call/CallRoomView.tsx"),
      "utf8"
    );
    expect(source).not.toMatch(/スピーカー/);
    expect(source).not.toMatch(/DockSpeakerIcon/);
    expect(source).not.toMatch(/setCallSpeakerOn/);
    expect(source).toMatch(/cm-call-dock/);
    expect(source).toMatch(/画面共有/);
    expect(source).toMatch(/退出/);
  });

  it("keeps remote playback volume forced on in RemoteAudio", () => {
    const source = readFileSync(
      join(process.cwd(), "app/call/voice/RemoteAudio.tsx"),
      "utf8"
    );
    expect(source).toMatch(/el\.volume = 1/);
    expect(source).not.toMatch(/getCallSpeakerOn/);
    expect(source).not.toMatch(/subscribeCallSpeaker/);
  });
});
