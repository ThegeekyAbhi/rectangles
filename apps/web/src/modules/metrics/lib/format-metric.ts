import type { SampleStatistics } from "@rectangles/engine";

const wholeNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const preciseNumber = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 3 });
const percentage = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

/** Shown where a figure is not available yet. */
export const NO_VALUE = "—";

/** Large numbers stay whole; small ones keep three significant digits. */
export function formatNumber(value: number): string {
  return Math.abs(value) >= 100 || Number.isInteger(value)
    ? wholeNumber.format(value)
    : preciseNumber.format(value);
}

export function formatPercentage(ratio: number): string {
  return percentage.format(ratio);
}

/** A value with its unit, as the engine declares it: `ratio` reads as a percentage. */
export function formatMetricValue(value: number | null, unit: string): string {
  if (value === null) {
    return NO_VALUE;
  }
  return unit === "ratio" ? formatPercentage(value) : `${formatNumber(value)} ${unit}`;
}

/** Chosen percentiles in one line, such as `p50 12 · p95 40 · p99 85 ms`. */
export function formatPercentiles(
  statistics: SampleStatistics,
  unit: string,
  percentiles: readonly ("p50" | "p95" | "p99")[] = ["p50", "p95", "p99"],
): string {
  return `${percentiles.map((percentile) => `${percentile} ${formatNumber(statistics[percentile])}`).join(" · ")} ${unit}`;
}

/** A rate, such as `480 requests/s`. */
export function formatPerSecond(value: number | null, unit: string): string {
  return value === null ? NO_VALUE : `${formatNumber(value)} ${unit}/s`;
}
