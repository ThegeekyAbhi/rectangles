import type { SampleStatistics, TrafficSummary } from "@rectangles/engine";

/** The whole system's headline figures. `null` where there is nothing to show yet. */
export interface OverviewFigures {
  /** What stretch of the run the figures cover. */
  readonly scope: "Latest second" | "Whole run";
  readonly offeredPerSecond: number | null;
  readonly throughputPerSecond: number | null;
  readonly errorRate: number | null;
  readonly latencyMs: SampleStatistics | null;
}

/**
 * Picks the figures that are fair to show. While a run is live they cover its latest
 * complete window, since the newest one is still filling. Once it has ended they cover
 * the whole run; `wholeRunLatency` comes from the finished result.
 */
export function overviewFigures(
  summary: TrafficSummary,
  wholeRunLatency: SampleStatistics | null,
  windowSeconds: number,
  isLive: boolean,
): OverviewFigures {
  if (!isLive) {
    return {
      scope: "Whole run",
      offeredPerSecond: summary.offeredPerSecond,
      throughputPerSecond: summary.throughputPerSecond,
      errorRate: summary.errorRate,
      latencyMs: wholeRunLatency,
    };
  }
  const latest = summary.windows.at(-2);
  if (latest === undefined) {
    return {
      scope: "Latest second",
      offeredPerSecond: null,
      throughputPerSecond: null,
      errorRate: null,
      latencyMs: null,
    };
  }
  const errors = latest.rejected + latest.failed + latest.timedOut;
  return {
    scope: "Latest second",
    offeredPerSecond: latest.offered / windowSeconds,
    throughputPerSecond: latest.succeeded / windowSeconds,
    errorRate: latest.offered === 0 ? null : errors / latest.offered,
    latencyMs: latest.latencyMs,
  };
}
