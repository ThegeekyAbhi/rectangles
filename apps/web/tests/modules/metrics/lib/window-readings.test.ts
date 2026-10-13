import { describe, expect, it } from "vitest";
import { completeWindows, currentLevel, currentRate } from "@/modules/metrics/lib/window-readings";

describe("completeWindows", () => {
  it("drops the window still filling while the run is live", () => {
    expect(completeWindows([1, 2, 3], true)).toEqual([1, 2]);
    expect(completeWindows([1, 2, 3], false)).toEqual([1, 2, 3]);
  });
});

describe("currentRate", () => {
  const reading = { windows: [100, 120, 30], total: 250, windowSeconds: 1, simulatedSeconds: 2.25 };

  it("uses the latest complete window while live", () => {
    expect(currentRate({ ...reading, isLive: true })).toBe(120);
  });

  it("has nothing to show before a window has completed", () => {
    expect(currentRate({ ...reading, windows: [30], isLive: true })).toBeNull();
  });

  it("averages over the whole run once it has ended", () => {
    expect(currentRate({ ...reading, simulatedSeconds: 2.5, isLive: false })).toBe(100);
  });

  it("has nothing to show for a run that ended at time zero", () => {
    expect(currentRate({ ...reading, simulatedSeconds: 0, isLive: false })).toBeNull();
  });
});

describe("currentLevel", () => {
  it("is the newest window's average while live", () => {
    expect(currentLevel([0.2, 1, 0.6], true)).toBe(0.6);
  });

  it("is the run's highest window average once it has ended", () => {
    expect(currentLevel([0.2, 1, 0.6], false)).toBe(1);
  });

  it("is nothing before any window exists", () => {
    expect(currentLevel([], true)).toBeNull();
  });
});
