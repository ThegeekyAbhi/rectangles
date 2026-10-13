import type {
  CallCounts,
  CounterResult,
  EdgeResult,
  GaugeResult,
  RecordedRun,
  SampleSnapshot,
  StopReason,
} from "./run-snapshot.ts";
import { buildRunSnapshot } from "./run-snapshot.ts";
import type { RunSummary } from "./run-summary.ts";
import { describeLatency } from "./run-summary.ts";
import type { SampleStatistics } from "./sample-statistics.ts";
import { describeSamples } from "./sample-statistics.ts";

/** A sample metric over a whole run: its statistics overall and per window. */
export interface SampleResult extends SampleStatistics {
  readonly id: string;
  readonly kind: "sample";
  readonly unit: string;
  readonly windows: readonly SampleStatistics[];
}

export type MetricResult = CounterResult | GaugeResult | SampleResult;

export interface NodeResult {
  readonly id: string;
  readonly type: string;
  readonly calls: CallCounts;
  readonly metrics: readonly MetricResult[];
}

/**
 * The outcome of a run. It holds no wall-clock data and its arrays follow the design's
 * node order and each component's declaration order, so the same design and seed always
 * serialise to the same bytes.
 */
export interface RunResult {
  readonly schemaVersion: 1;
  readonly seed: number;
  /** `null` while the run is still in progress. */
  readonly stopReason: StopReason | null;
  readonly simulatedSeconds: number;
  readonly eventsProcessed: number;
  readonly windowSeconds: number;
  readonly summary: RunSummary;
  readonly nodes: readonly NodeResult[];
  readonly edges: readonly EdgeResult[];
}

/**
 * A snapshot of every window, plus what a snapshot leaves out because it means
 * sorting every sample: whole-run percentiles of each sample metric and of latency.
 */
export function buildRunResult(run: RecordedRun): RunResult {
  const snapshot = buildRunSnapshot(run, 0);
  // Sample metrics appear in the snapshot in the order the recorder registered them.
  const sampleSeries = run.recorder.metrics.flatMap(({ series }) =>
    series.kind === "sample" ? [series] : [],
  );
  let nextSample = 0;
  const overWholeRun = (metric: SampleSnapshot): SampleResult => {
    const series = sampleSeries[nextSample++];
    return {
      id: metric.id,
      kind: "sample",
      unit: metric.unit,
      ...describeSamples(series?.values.subarray(0, series.length) ?? new Float64Array(0)),
      windows: metric.windows,
    };
  };

  return {
    schemaVersion: 1,
    seed: run.seed,
    stopReason: snapshot.stopReason,
    simulatedSeconds: snapshot.simulatedSeconds,
    eventsProcessed: snapshot.eventsProcessed,
    windowSeconds: snapshot.windowSeconds,
    summary: { ...snapshot.summary, latencyMs: describeLatency(run.recorder) },
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      metrics: node.metrics.map((metric) =>
        metric.kind === "sample" ? overWholeRun(metric) : metric,
      ),
    })),
    edges: snapshot.edges,
  };
}
