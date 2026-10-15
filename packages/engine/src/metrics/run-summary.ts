import { END_TO_END_METRIC_IDS } from "../contract/metric.ts";
import type { Micros } from "../contract/time-units.ts";
import { microsToSeconds } from "../contract/time-units.ts";
import type { CounterSeries, MetricRecorder, SampleSeries } from "./metric-recorder.ts";
import type { SampleStatistics } from "./sample-statistics.ts";
import { describeSamples } from "./sample-statistics.ts";

/** One window of traffic as its originators saw it. */
export interface WindowSummary {
  readonly offered: number;
  readonly succeeded: number;
  readonly rejected: number;
  readonly failed: number;
  readonly timedOut: number;
  /** Latency of the requests answered successfully in this window. */
  readonly latencyMs: SampleStatistics;
}

/** Totals so far as the traffic's originators saw them. Cheap to compute mid-run. */
export interface TrafficSummary {
  /** Requests generated, including retries. */
  readonly offered: number;
  /** Requests answered successfully within the originator's timeout. */
  readonly succeeded: number;
  readonly rejected: number;
  readonly failed: number;
  readonly timedOut: number;
  /** Requests still unanswered when the run stopped. */
  readonly inFlight: number;
  readonly offeredPerSecond: number;
  /** Successful requests per second (goodput). */
  readonly throughputPerSecond: number;
  /** (rejected + failed + timed out) ÷ offered. */
  readonly errorRate: number;
  readonly windows: readonly WindowSummary[];
}

/** Whole-run totals as the traffic's originators saw them. */
export interface RunSummary extends TrafficSummary {
  /** Latency of successful requests. */
  readonly latencyMs: SampleStatistics;
}

const COUNT_KEYS = ["offered", "succeeded", "rejected", "failed", "timedOut"] as const;
type CountKey = (typeof COUNT_KEYS)[number];
type Counts = Record<CountKey, number>;

const COUNT_KEY_BY_METRIC_ID: ReadonlyMap<string, CountKey> = new Map(
  COUNT_KEYS.map((key) => [END_TO_END_METRIC_IDS[key], key]),
);

interface EndToEndSeries {
  readonly counters: Readonly<Record<CountKey, CounterSeries[]>>;
  readonly inFlight: number;
  readonly latencies: readonly SampleSeries[];
}

/** Gathers the end-to-end metrics of every node that declares them. */
function collectEndToEndSeries(recorder: MetricRecorder): EndToEndSeries {
  const counters = {} as Record<CountKey, CounterSeries[]>;
  for (const key of COUNT_KEYS) {
    counters[key] = [];
  }
  let inFlight = 0;
  const latencies: SampleSeries[] = [];

  for (const { spec, series } of recorder.metrics) {
    if (series.kind === "counter") {
      const key = COUNT_KEY_BY_METRIC_ID.get(spec.id);
      if (key !== undefined) {
        counters[key].push(series);
      }
    } else if (series.kind === "gauge") {
      if (spec.id === END_TO_END_METRIC_IDS.inFlight) inFlight += series.value;
    } else if (spec.id === END_TO_END_METRIC_IDS.latency) {
      latencies.push(series);
    }
  }
  return { counters, inFlight, latencies };
}

/** Joins sample buffers into one. A single buffer is returned as it is. */
function joinSamples(parts: readonly Float64Array[]): Float64Array {
  const [only] = parts;
  if (parts.length === 1 && only !== undefined) {
    return only;
  }
  let length = 0;
  for (const part of parts) {
    length += part.length;
  }
  const joined = new Float64Array(length);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}

/** Each count summed across its counters, reading each counter with `pick`. */
function sumCounts(
  counters: Readonly<Record<CountKey, readonly CounterSeries[]>>,
  pick: (series: CounterSeries) => number,
): Counts {
  const counts = {} as Counts;
  for (const key of COUNT_KEYS) {
    let sum = 0;
    for (const series of counters[key]) {
      sum += pick(series);
    }
    counts[key] = sum;
  }
  return counts;
}

/**
 * Sums the end-to-end metrics of every node that declares them, reporting the windows
 * from `fromWindow` on. Leaves out whole-run latency, which needs every sample sorted.
 */
export function summariseTraffic(
  recorder: MetricRecorder,
  nowMicros: Micros,
  fromWindow: number,
): TrafficSummary {
  const endToEnd = collectEndToEndSeries(recorder);
  const windowsElapsed = recorder.windowsElapsedAt(nowMicros);
  const { counters, latencies } = endToEnd;
  // Samples are stored in time order, so each window's samples follow the previous one's.
  const sampleOffsets = latencies.map((series) => {
    let offset = 0;
    for (let windowIndex = 0; windowIndex < fromWindow; windowIndex++) {
      offset += series.windowCounts[windowIndex] ?? 0;
    }
    return offset;
  });

  const windows: WindowSummary[] = [];
  for (let windowIndex = fromWindow; windowIndex < windowsElapsed; windowIndex++) {
    const inWindow = (series: CounterSeries) => series.windows[windowIndex] ?? 0;
    const parts = latencies.map((series, seriesIndex) => {
      const start = sampleOffsets[seriesIndex] ?? 0;
      const end = start + (series.windowCounts[windowIndex] ?? 0);
      sampleOffsets[seriesIndex] = end;
      return series.values.subarray(start, end);
    });
    windows.push({ ...sumCounts(counters, inWindow), latencyMs: describeSamples(joinSamples(parts)) });
  }

  const totals = sumCounts(counters, (series) => series.total);
  const { offered, succeeded, rejected, failed, timedOut } = totals;
  const seconds = microsToSeconds(nowMicros);
  return {
    ...totals,
    inFlight: endToEnd.inFlight,
    offeredPerSecond: seconds === 0 ? 0 : offered / seconds,
    throughputPerSecond: seconds === 0 ? 0 : succeeded / seconds,
    errorRate: offered === 0 ? 0 : (rejected + failed + timedOut) / offered,
    windows,
  };
}

/** Latency of every successful request of the run so far, across all originators. */
export function describeLatency(recorder: MetricRecorder): SampleStatistics {
  const { latencies } = collectEndToEndSeries(recorder);
  return describeSamples(
    joinSamples(latencies.map((series) => series.values.subarray(0, series.length))),
  );
}
