import type { MetricResult, MetricSnapshot } from "@rectangles/engine";
import { formatMetricValue, formatNumber, formatPercentiles, formatPerSecond, NO_VALUE } from "./format-metric";
import type { RunTiming } from "./window-readings";
import { currentRate, latestCompleteWindow } from "./window-readings";

/**
 * A metric's current figures in words. `finished` is the same metric from the finished
 * run, which adds the whole-run percentiles a live snapshot leaves out.
 */
export function describeMetric(
  metric: MetricSnapshot,
  finished: MetricResult | undefined,
  timing: RunTiming,
): string {
  if (metric.kind === "counter") {
    const rate = currentRate({ windows: metric.windows, total: metric.total, ...timing });
    return `${formatNumber(metric.total)} ${metric.unit} · ${formatPerSecond(rate, metric.unit)}`;
  }
  if (metric.kind === "gauge") {
    return timing.isLive
      ? `now ${formatMetricValue(metric.last, metric.unit)} · peak ${formatMetricValue(metric.max, metric.unit)}`
      : `mean ${formatMetricValue(metric.mean, metric.unit)} · peak ${formatMetricValue(metric.max, metric.unit)}`;
  }
  const statistics = finished?.kind === "sample" ? finished : latestCompleteWindow(metric.windows);
  if (statistics === undefined || statistics.count === 0) {
    return metric.count === 0 ? "no samples" : NO_VALUE;
  }
  return formatPercentiles(statistics, metric.unit);
}
