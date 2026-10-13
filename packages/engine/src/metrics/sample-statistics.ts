export interface SampleStatistics {
  readonly count: number;
  readonly mean: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
}


const EMPTY_STATISTICS: SampleStatistics = { count: 0, mean: 0, p50: 0, p95: 0, p99: 0, max: 0 };

/** Nearest-rank percentile of an ascending array. */
function percentile(sorted: Float64Array, fraction: number): number {
  const rank = Math.max(1, Math.ceil(fraction * sorted.length));
  return sorted[rank - 1] ?? 0;
}

/** Mean and exact percentiles of the given values. Sorts a copy. */
export function describeSamples(values: Float64Array): SampleStatistics {
  if (values.length === 0) {
    return EMPTY_STATISTICS;
  }
  const sorted = values.slice().sort();
  let sum = 0;
  for (const value of sorted) {
    sum += value;
  }
  return {
    count: sorted.length,
    mean: sum / sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1] ?? 0,
  };
}
