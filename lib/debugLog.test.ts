import { describe, expect, it } from "vitest";
import { shouldEmitProductionLogLine } from "./debugLog";

describe("shouldEmitProductionLogLine", () => {
  it("allows critical failures in production", () => {
    expect(
      shouldEmitProductionLogLine("[invite-join] failed step=join-by-invite error=invite_expired")
    ).toBe(true);
    expect(
      shouldEmitProductionLogLine("[remote-audio] audio_confirmed_strict remote=abcd")
    ).toBe(true);
  });

  it("suppresses routine diagnostics in production", () => {
    expect(
      shouldEmitProductionLogLine(
        "[voice-signal] ignored remote=abcd type=offer reason=self_signal"
      )
    ).toBe(false);
    expect(
      shouldEmitProductionLogLine(
        "[room-perf] fetchStatus apply skipped=same_members reason=poll"
      )
    ).toBe(false);
    expect(
      shouldEmitProductionLogLine(
        "[remote-audio] play-success remote=abcd instance=abcd"
      )
    ).toBe(false);
  });
});
