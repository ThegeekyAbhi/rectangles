import type { TrafficSummary, WindowSummary } from "@rectangles/engine";
import { describe, expect, it } from "vitest";
import { overviewFigures } from "@/modules/metrics/lib/overview-figures";

const latency = { count: 9, mean: 12, p50: 10, p95: 30, p99: 40, max: 41 };
const wholeRunLatency = { ...latency, p50: 11 };

function window(change: Partial<WindowSummary>): WindowSummary {
  return { offered: 0, succeeded: 0, rejected: 0, failed: 0, timedOut: 0, latencyMs: latency, ...change };
}

const summary: TrafficSummary = {
  offered: 250,
  succeeded: 200,
  rejected: 30,
  failed: 0,
  timedOut: 20,
  inFlight: 0,
  offeredPerSecond: 100,
  throughputPerSecond: 80,
  errorRate: 0.2,
  windows: [
    window({ offered: 100, succeeded: 100 }),
    window({ offered: 120, succeeded: 90, rejected: 20, timedOut: 10 }),
    window({ offered: 30, succeeded: 10 }),
  ],
};

describe("overviewFigures", () => {
  it("covers the latest complete window while the run is live", () => {
    expect(overviewFigures(summary, null, 1, true)).toEqual({
      scope: "Latest second",
      offeredPerSecond: 120,
      throughputPerSecond: 90,
      errorRate: 0.25,
      latencyMs: latency,
    });
  });

  it("has nothing to show before a window has completed", () => {
    const early = { ...summary, windows: summary.windows.slice(0, 1) };
    expect(overviewFigures(early, null, 1, true)).toMatchObject({
      offeredPerSecond: null,
      throughputPerSecond: null,
      errorRate: null,
      latencyMs: null,
    });
  });

  it("leaves the error rate out for a window with no traffic", () => {
    const quiet = { ...summary, windows: [window({}), window({})] };
    expect(overviewFigures(quiet, null, 1, true).errorRate).toBeNull();
  });

  it("covers the whole run once it has ended, with its exact latency", () => {
    expect(overviewFigures(summary, wholeRunLatency, 1, false)).toEqual({
      scope: "Whole run",
      offeredPerSecond: 100,
      throughputPerSecond: 80,
      errorRate: 0.2,
      latencyMs: wholeRunLatency,
    });
  });
});
