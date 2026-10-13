import { describe, expect, it } from "vitest";
import { describeMetric } from "@/modules/metrics/lib/describe-metric";

const live = { windowSeconds: 1, simulatedSeconds: 2.5, isLive: true };
const ended = { windowSeconds: 1, simulatedSeconds: 3, isLive: false };
const samples = { count: 9, mean: 12, p50: 10, p95: 30, p99: 40, max: 41 };
const noSamples = { count: 0, mean: 0, p50: 0, p95: 0, p99: 0, max: 0 };

describe("describeMetric", () => {
  it("gives a counter's total and rate", () => {
    const counter = { id: "requests.completed", kind: "counter", unit: "requests", total: 300, windows: [100, 120, 80] } as const;
    expect(describeMetric(counter, undefined, live)).toBe("300 requests · 120 requests/s");
    expect(describeMetric(counter, undefined, ended)).toBe("300 requests · 100 requests/s");
  });

  it("gives a gauge's level now while live, and its mean once ended", () => {
    const gauge = { id: "utilisation", kind: "gauge", unit: "ratio", mean: 0.5, max: 1, last: 0.75, windows: [0.5] } as const;
    expect(describeMetric(gauge, undefined, live)).toBe("now 75% · peak 100%");
    expect(describeMetric(gauge, undefined, ended)).toBe("mean 50% · peak 100%");
  });

  it("gives a sample's latest complete window while live", () => {
    const sample = { id: "queue.wait", kind: "sample", unit: "ms", count: 18, windows: [samples, noSamples] } as const;
    expect(describeMetric(sample, undefined, live)).toBe("p50 10 · p95 30 · p99 40 ms");
  });

  it("gives a sample's whole-run percentiles once the run has ended", () => {
    const sample = { id: "queue.wait", kind: "sample", unit: "ms", count: 9, windows: [samples] } as const;
    const finished = { ...sample, ...samples, p50: 11 };
    expect(describeMetric(sample, finished, ended)).toBe("p50 11 · p95 30 · p99 40 ms");
  });

  it("says when a sample has nothing recorded", () => {
    const sample = { id: "queue.wait", kind: "sample", unit: "ms", count: 0, windows: [noSamples, noSamples] } as const;
    expect(describeMetric(sample, undefined, live)).toBe("no samples");
  });
});
