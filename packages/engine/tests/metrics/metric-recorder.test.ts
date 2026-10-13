import { describe, expect, it } from "vitest";
import type { MetricKind, MetricSpec } from "../../src/contract/metric.ts";
import { MICROS_PER_SECOND } from "../../src/contract/time-units.ts";
import { MetricRecorder } from "../../src/metrics/metric-recorder.ts";
import { buildRunResult } from "../../src/metrics/run-result.ts";

function spec(id: string, kind: MetricKind): MetricSpec {
  return { id, kind, unit: "", definition: "" };
}

function resultOf(recorder: MetricRecorder, nowMicros: number) {
  return buildRunResult({
    seed: 1,
    stopReason: "completed",
    nowMicros,
    eventsProcessed: 0,
    recorder,
    nodes: [{ id: "node", type: "test", callsReceived: 0, callsReplied: 0 }],
    edges: [],
  }).nodes[0]?.metrics[0];
}

describe("MetricRecorder", () => {
  it("sums a counter per one-second window and in total", () => {
    const recorder = new MetricRecorder(MICROS_PER_SECOND, 3);
    const handle = recorder.register(0, spec("requests.completed", "counter"));
    recorder.count(handle, 1, 0);
    recorder.count(handle, 2, 999_999);
    recorder.count(handle, 5, 1_000_000);
    recorder.count(handle, 1, 2_500_000);

    expect(resultOf(recorder, 3_000_000)).toMatchObject({ total: 9, windows: [3, 5, 1] });
  });

  it("averages a gauge over time, splitting a level across window boundaries", () => {
    const recorder = new MetricRecorder(MICROS_PER_SECOND, 3);
    const handle = recorder.register(0, spec("queue.depth", "gauge"));
    // 0 until 0.5 s, 4 until 2.25 s, then 8 to the end at 3 s.
    recorder.setGauge(handle, 4, 500_000);
    recorder.setGauge(handle, 8, 2_250_000);

    const result = resultOf(recorder, 3_000_000);
    expect(result).toMatchObject({ windows: [2, 4, 7], max: 8, last: 8 });
    expect(result).toHaveProperty("mean", (2 + 4 + 7) / 3);
  });

  it("averages a gauge's last window over the part of it that has elapsed", () => {
    const recorder = new MetricRecorder(MICROS_PER_SECOND, 3);
    const handle = recorder.register(0, spec("queue.depth", "gauge"));
    recorder.setGauge(handle, 6, 1_000_000);

    expect(resultOf(recorder, 1_500_000)).toMatchObject({ windows: [0, 6], mean: 2 });
  });

  it("gives the same gauge result however often it is read mid-run", () => {
    const recorder = new MetricRecorder(MICROS_PER_SECOND, 2);
    const handle = recorder.register(0, spec("queue.depth", "gauge"));
    recorder.setGauge(handle, 2, 0);
    resultOf(recorder, 400_000);
    resultOf(recorder, 400_000);
    recorder.setGauge(handle, 0, 1_000_000);

    expect(resultOf(recorder, 2_000_000)).toMatchObject({ windows: [2, 0], mean: 1 });
  });

  it("reports exact percentiles of samples per window and overall", () => {
    const recorder = new MetricRecorder(MICROS_PER_SECOND, 2);
    const handle = recorder.register(0, spec("latency", "sample"));
    for (let value = 100; value >= 1; value--) {
      recorder.sample(handle, value, 0);
    }
    recorder.sample(handle, 1000, 1_000_000);

    const result = resultOf(recorder, 2_000_000);
    expect(result).toMatchObject({ count: 101, p50: 51, p95: 96, p99: 100, max: 1000 });
    expect(result).toMatchObject({
      windows: [
        { count: 100, mean: 50.5, p50: 50, p95: 95, p99: 99, max: 100 },
        { count: 1, mean: 1000, p50: 1000, p99: 1000 },
      ],
    });
  });

  it("keeps every sample when the buffer grows", () => {
    const recorder = new MetricRecorder(MICROS_PER_SECOND, 1);
    const handle = recorder.register(0, spec("latency", "sample"));
    for (let value = 1; value <= 5000; value++) {
      recorder.sample(handle, value, 0);
    }
    expect(resultOf(recorder, 1_000_000)).toMatchObject({ count: 5000, mean: 2500.5, max: 5000 });
  });

  it("reports only the windows that have started", () => {
    const recorder = new MetricRecorder(MICROS_PER_SECOND, 10);
    const handle = recorder.register(0, spec("requests.completed", "counter"));
    recorder.count(handle, 1, 100);
    expect(resultOf(recorder, 1_200_000)).toMatchObject({ windows: [1, 0] });
  });

  it("throws when a metric is recorded as the wrong kind", () => {
    const recorder = new MetricRecorder(MICROS_PER_SECOND, 1);
    const handle = recorder.register(0, spec("queue.depth", "gauge"));
    expect(() => {
      recorder.count(handle, 1, 0);
    }).toThrow(/recorded as a counter but is a gauge/);
    expect(() => {
      recorder.sample(99, 1, 0);
    }).toThrow(/not registered/);
  });
});
