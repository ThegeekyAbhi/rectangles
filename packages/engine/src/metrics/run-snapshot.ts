import type { Micros } from "../contract/time-units.ts";
import { microsToSeconds } from "../contract/time-units.ts";
import type { CounterSeries, GaugeSeries, MetricRecorder, SampleSeries } from "./metric-recorder.ts";
import type { TrafficSummary } from "./run-summary.ts";
import { summariseTraffic } from "./run-summary.ts";
import type { SampleStatistics } from "./sample-statistics.ts";
import { describeSamples } from "./sample-statistics.ts";

/**
 * Why a run ended.
 *
 * - `completed`: reached the configured duration.
 * - `event-limit`: processed the maximum number of events first.
 * - `time-limit`: the configured duration exceeds the maximum simulated time.
 */
export type StopReason = "completed" | "event-limit" | "time-limit";

export interface CounterResult {
  readonly id: string;
  readonly kind: "counter";
  readonly unit: string;
  readonly total: number;
  /** Sum per window. */
  readonly windows: readonly number[];
}

export interface GaugeResult {
  readonly id: string;
  readonly kind: "gauge";
  readonly unit: string;
  /** Time-weighted mean over the whole run. */
  readonly mean: number;
  readonly max: number;
  /** Value when the run stopped. */
  readonly last: number;
  /** Time-weighted mean per window. */
  readonly windows: readonly number[];
}

/** A sample metric mid-run: how many values so far, and statistics per window. */
export interface SampleSnapshot {
  readonly id: string;
  readonly kind: "sample";
  readonly unit: string;
  readonly count: number;
  readonly windows: readonly SampleStatistics[];
}

export type MetricSnapshot = CounterResult | GaugeResult | SampleSnapshot;

/** Calls counted by the engine itself, independent of what a component reports. */
export interface CallCounts {
  readonly received: number;
  readonly replied: number;
  readonly inFlight: number;
}

export interface NodeSnapshot {
  readonly id: string;
  readonly type: string;
  readonly calls: CallCounts;
  readonly metrics: readonly MetricSnapshot[];
}

/** Calls that travelled along one edge, counted by the engine itself. */
export interface EdgeResult {
  readonly id: string;
  readonly calls: {
    readonly sent: number;
    readonly replied: number;
    readonly inFlight: number;
  };
  /** Calls sent per window. */
  readonly sentWindows: readonly number[];
}

/**
 * A run's metrics at one moment, cheap enough to take many times a second.
 *
 * Totals cover the run so far. Every `windows` array (and an edge's `sentWindows`)
 * starts at window `fromWindow`, so a caller that already holds the earlier windows
 * does not pay for them again. The last window is still filling unless the run has
 * stopped. Whole-run percentiles are left out; they come with the final `RunResult`.
 */
export interface RunSnapshot {
  /** `null` while the run is still in progress. */
  readonly stopReason: StopReason | null;
  readonly simulatedSeconds: number;
  readonly eventsProcessed: number;
  readonly windowSeconds: number;
  /** Index of the first window reported. */
  readonly fromWindow: number;
  readonly summary: TrafficSummary;
  readonly nodes: readonly NodeSnapshot[];
  readonly edges: readonly EdgeResult[];
}

/** What the kernel knows about a run, from which snapshots and the result are built. */
export interface RecordedRun {
  readonly seed: number;
  readonly stopReason: StopReason | null;
  readonly nowMicros: Micros;
  readonly eventsProcessed: number;
  readonly recorder: MetricRecorder;
  readonly nodes: readonly {
    readonly id: string;
    readonly type: string;
    readonly callsReceived: number;
    readonly callsReplied: number;
  }[];
  readonly edges: readonly {
    readonly id: string;
    readonly sent: CounterSeries;
    readonly replied: number;
  }[];
}

function gaugeWindows(
  series: GaugeSeries,
  fromWindow: number,
  windowsElapsed: number,
  windowMicros: Micros,
  nowMicros: Micros,
): { mean: number; windows: number[] } {
  const windows: number[] = [];
  let totalIntegral = 0;
  for (let windowIndex = 0; windowIndex < windowsElapsed; windowIndex++) {
    const integral = series.integrals[windowIndex] ?? 0;
    totalIntegral += integral;
    if (windowIndex >= fromWindow) {
      const windowStartMicros = windowIndex * windowMicros;
      const isLastWindow = windowIndex === windowsElapsed - 1;
      const coveredMicros = isLastWindow ? nowMicros - windowStartMicros : windowMicros;
      windows.push(integral / coveredMicros);
    }
  }
  return { mean: nowMicros === 0 ? 0 : totalIntegral / nowMicros, windows };
}

function sampleWindows(
  series: SampleSeries,
  fromWindow: number,
  windowsElapsed: number,
): SampleStatistics[] {
  const windows: SampleStatistics[] = [];
  let offset = 0;
  for (let windowIndex = 0; windowIndex < windowsElapsed; windowIndex++) {
    const count = series.windowCounts[windowIndex] ?? 0;
    if (windowIndex >= fromWindow) {
      windows.push(describeSamples(series.values.subarray(offset, offset + count)));
    }
    offset += count;
  }
  return windows;
}

export function buildRunSnapshot(run: RecordedRun, fromWindow: number): RunSnapshot {
  const { recorder, nowMicros } = run;
  recorder.integrateGauges(nowMicros);
  const windowsElapsed = recorder.windowsElapsedAt(nowMicros);
  const firstWindow = Math.min(Math.max(0, Math.floor(fromWindow)), windowsElapsed);

  const metricsByNode: MetricSnapshot[][] = run.nodes.map(() => []);
  for (const { nodeIndex, spec, series } of recorder.metrics) {
    const { id, unit } = spec;
    let metric: MetricSnapshot;
    if (series.kind === "counter") {
      const windows = Array.from(series.windows.subarray(firstWindow, windowsElapsed));
      metric = { id, kind: "counter", unit, total: series.total, windows };
    } else if (series.kind === "gauge") {
      const { mean, windows } = gaugeWindows(
        series,
        firstWindow,
        windowsElapsed,
        recorder.windowMicros,
        nowMicros,
      );
      metric = { id, kind: "gauge", unit, mean, max: series.max, last: series.value, windows };
    } else {
      const windows = sampleWindows(series, firstWindow, windowsElapsed);
      metric = { id, kind: "sample", unit, count: series.length, windows };
    }
    metricsByNode[nodeIndex]?.push(metric);
  }

  return {
    stopReason: run.stopReason,
    simulatedSeconds: microsToSeconds(nowMicros),
    eventsProcessed: run.eventsProcessed,
    windowSeconds: microsToSeconds(recorder.windowMicros),
    fromWindow: firstWindow,
    summary: summariseTraffic(recorder, nowMicros, firstWindow),
    nodes: run.nodes.map((node, nodeIndex) => ({
      id: node.id,
      type: node.type,
      calls: {
        received: node.callsReceived,
        replied: node.callsReplied,
        inFlight: node.callsReceived - node.callsReplied,
      },
      metrics: metricsByNode[nodeIndex] ?? [],
    })),
    edges: run.edges.map((edge) => ({
      id: edge.id,
      calls: {
        sent: edge.sent.total,
        replied: edge.replied,
        inFlight: edge.sent.total - edge.replied,
      },
      sentWindows: Array.from(edge.sent.windows.subarray(firstWindow, windowsElapsed)),
    })),
  };
}
