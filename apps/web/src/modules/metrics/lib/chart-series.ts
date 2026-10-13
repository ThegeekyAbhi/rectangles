import type { MetricSnapshot, WindowSummary } from "@rectangles/engine";
import { completeWindows } from "./window-readings";

/** How a line is drawn. Colour is kept for state; everything else is a shade of the text colour. */
export type ChartTone = "strong" | "soft" | "healthy" | "saturated";

export interface ChartLine {
  readonly label: string;
  readonly tone: ChartTone;
  readonly isDashed?: boolean;
}

/** Columns for the chart: x values first, then one column per line. `null` leaves a gap. */
export type ChartColumns = [xs: number[], ...ys: (number | null)[][]];

export interface Chart {
  readonly lines: readonly ChartLine[];
  readonly columns: ChartColumns;
}

/** The simulated second at which each window starts. */
function windowStarts(count: number, windowSeconds: number): number[] {
  return Array.from({ length: count }, (_, index) => index * windowSeconds);
}

/** Offered, successful and failed requests per second, window by window. */
export function trafficRateChart(
  windows: readonly WindowSummary[],
  windowSeconds: number,
  isLive: boolean,
): Chart {
  const complete = completeWindows(windows, isLive);
  return {
    lines: [
      { label: "Offered", tone: "soft", isDashed: true },
      { label: "Succeeded", tone: "healthy" },
      { label: "Errors", tone: "saturated" },
    ],
    columns: [
      windowStarts(complete.length, windowSeconds),
      complete.map((window) => window.offered / windowSeconds),
      complete.map((window) => window.succeeded / windowSeconds),
      complete.map((window) => (window.rejected + window.failed + window.timedOut) / windowSeconds),
    ],
  };
}

/** Latency percentiles of successful requests, window by window. */
export function latencyChart(
  windows: readonly WindowSummary[],
  windowSeconds: number,
  isLive: boolean,
): Chart {
  const complete = completeWindows(windows, isLive);
  const pick = (measure: "p50" | "p95" | "p99") =>
    complete.map((window) => (window.latencyMs.count === 0 ? null : window.latencyMs[measure]));
  return {
    lines: [
      { label: "p50", tone: "strong" },
      { label: "p95", tone: "soft" },
      { label: "p99", tone: "soft", isDashed: true },
    ],
    columns: [windowStarts(complete.length, windowSeconds), pick("p50"), pick("p95"), pick("p99")],
  };
}

/**
 * One metric over time: a counter as a rate per second, a gauge as its average per
 * window, a sample as its median and 99th percentile.
 */
export function metricChart(metric: MetricSnapshot, windowSeconds: number, isLive: boolean): Chart {
  if (metric.kind === "counter") {
    const complete = completeWindows(metric.windows, isLive);
    return {
      lines: [{ label: `${metric.unit}/s`, tone: "strong" }],
      columns: [
        windowStarts(complete.length, windowSeconds),
        complete.map((count) => count / windowSeconds),
      ],
    };
  }
  if (metric.kind === "gauge") {
    const complete = completeWindows(metric.windows, isLive);
    return {
      lines: [{ label: metric.unit, tone: "strong" }],
      columns: [windowStarts(complete.length, windowSeconds), [...complete]],
    };
  }
  const complete = completeWindows(metric.windows, isLive);
  return {
    lines: [
      { label: "p50", tone: "strong" },
      { label: "p99", tone: "soft", isDashed: true },
    ],
    columns: [
      windowStarts(complete.length, windowSeconds),
      complete.map((window) => (window.count === 0 ? null : window.p50)),
      complete.map((window) => (window.count === 0 ? null : window.p99)),
    ],
  };
}
