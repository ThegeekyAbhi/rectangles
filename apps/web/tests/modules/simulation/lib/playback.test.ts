import { describe, expect, it } from "vitest";
import { PLAYBACK_SECONDS, simulatedMicrosFor, TICK_MS } from "@/modules/simulation/lib/playback";

describe("simulatedMicrosFor", () => {
  it("plays a run of any length back in the same real time", () => {
    const ticks = (PLAYBACK_SECONDS * 1_000) / TICK_MS;
    expect(simulatedMicrosFor(60, TICK_MS) * ticks).toBe(60_000_000);
    expect(simulatedMicrosFor(600, TICK_MS) * ticks).toBe(600_000_000);
  });

  it("does not leap ahead after a long gap, such as a background tab", () => {
    expect(simulatedMicrosFor(60, 60_000)).toBe(simulatedMicrosFor(60, TICK_MS * 2.5));
  });

  it("never goes backwards", () => {
    expect(simulatedMicrosFor(60, -10)).toBe(0);
  });
});
