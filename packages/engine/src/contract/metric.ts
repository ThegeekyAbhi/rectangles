/**
 * - `counter`: things that happened; summed per window.
 * - `gauge`: a level that changes over time; averaged over time per window.
 * - `sample`: one value per occurrence; reported as mean and percentiles.
 */
export type MetricKind = "counter" | "gauge" | "sample";

/** A metric a component promises to emit. Recording anything undeclared is an error. */
export interface MetricSpec {
  /** `<subject>.<measure>` in kebab-case, for example `queue.depth`. */
  readonly id: string;
  readonly kind: MetricKind;
  readonly unit: string;
  /** Plain-language meaning, shown on hover. */
  readonly definition: string;
}

/** Opaque reference to one of a component's own metrics, resolved once in `init`. */
export type MetricHandle = number;

/**
 * Metric ids that describe how full a component is. Any component declaring them has
 * its load shown on the canvas; nothing looks for a component by type.
 */
export const CAPACITY_METRIC_IDS = {
  utilisation: "utilisation",
  queueDepth: "queue.depth",
} as const;

/**
 * Metric ids that describe traffic as its originator sees it. Any component declaring
 * them is included in the run summary; the engine never looks for a component by type.
 */
export const END_TO_END_METRIC_IDS = {
  offered: "end-to-end.offered",
  succeeded: "end-to-end.succeeded",
  rejected: "end-to-end.rejected",
  failed: "end-to-end.failed",
  timedOut: "end-to-end.timed-out",
  inFlight: "end-to-end.in-flight",
  latency: "end-to-end.latency",
} as const;
