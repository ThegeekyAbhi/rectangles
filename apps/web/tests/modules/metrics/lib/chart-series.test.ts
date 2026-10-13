import type { WindowSummary } from "@rectangles/engine";
import { describe, expect, it } from "vitest";
import { latencyChart, metricChart, trafficRateChart } from "@/modules/metrics/lib/chart-series";

const noSamples = { count: 0, mean: 0, p50: 0, p95: 0, p99: 0, max: 0 };
const someSamples = { count: 9, mean: 12, p50: 10, p95: 30, p99: 40, max: 41 };

function window(change: Partial<WindowSummary>): WindowSummary {
  return { offered: 0, succeeded: 0, rejected: 0, failed: 0, timedOut: 0, latencyMs: noSamples, ...change };
}

const windows = [
  window({ offered: 100, succeeded: 90, rejected: 6, timedOut: 4, latencyMs: someSamples }),
  window({ offered: 80, succeeded: 80 }),
  window({ offered: 10, succeeded: 5 }),
];

describe("trafficRateChart", () => {
  it("plots offered, successful and failed requests per second", () => {
    expect(trafficRateChart(windows, 2, false).columns).toEqual([
      [0, 2, 4],
      [50, 40, 5],
      [45, 40, 2.5],
      [5, 0, 0],
    ]);
  });

  it("leaves out the window still filling while live", () => {
    expect(trafficRateChart(windows, 1, true).columns[0]).toEqual([0, 1]);
  });
});

describe("latencyChart", () => {
  it("leaves a gap where a window had no successful requests", () => {
    expect(latencyChart(windows, 1, false).columns).toEqual([
      [0, 1, 2],
      [10, null, null],
      [30, null, null],
      [40, null, null],
    ]);
  });
});

describe("metricChart", () => {
  it("plots a counter as a rate", () => {
    const chart = metricChart({ id: "requests.completed", kind: "counter", unit: "requests", total: 30, windows: [10, 20] }, 2, false);
    expect(chart.columns).toEqual([[0, 2], [5, 10]]);
    expect(chart.lines).toEqual([{ label: "requests/s", tone: "strong" }]);
  });

  it("plots a gauge as its average per window", () => {
    const chart = metricChart(
      { id: "queue.depth", kind: "gauge", unit: "requests", mean: 2, max: 9, last: 4, windows: [1, 3, 4] },
      1,
      true,
    );
    expect(chart.columns).toEqual([[0, 1], [1, 3]]);
  });

  it("plots a sample as its median and 99th percentile", () => {
    const chart = metricChart(
      { id: "queue.wait", kind: "sample", unit: "ms", count: 9, windows: [someSamples, noSamples] },
      1,
      false,
    );
    expect(chart.columns).toEqual([[0, 1], [10, null], [40, null]]);
    expect(chart.lines.map((line) => line.label)).toEqual(["p50", "p99"]);
  });
});
