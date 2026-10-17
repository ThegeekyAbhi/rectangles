import type { MetricHandle } from "./metric.ts";

/**
 * Hardware a component can hold, owned and queued by the kernel so every component
 * models it the same way. CPU only so far; memory, disk and network follow
 * (new-algorithm.md §3.1).
 */

/** Opaque reference to one of a component's CPU pools, created once in `init`. */
export type CpuHandle = number;

/** How long each piece of work takes around its mean. */
export type WorkDistribution = "exponential" | "constant";

/** The component's own gauges the kernel keeps up to date for a CPU pool. */
export interface CpuMetrics {
  /** Busy cores ÷ cores. */
  readonly utilisation: MetricHandle;
  /** Work waiting for a free core. */
  readonly queueDepth: MetricHandle;
}
