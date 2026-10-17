export interface SlotServerOptions {
  /** Requests handled at once. */
  readonly workers: number;
  /** Mean time each request holds a worker. */
  readonly holdMs: number;
  readonly distribution?: "exponential" | "constant";
  readonly queueLimit?: number;
}

/**
 * An API server config whose capacity is plain slots: `workers` requests at once, each
 * holding one for `holdMs`, with no CPU time. It is the M/M/c server of queueing theory,
 * so tests about queues, routing and clients stay independent of the CPU model.
 */
export function slotServer(options: SlotServerOptions) {
  return {
    workers: options.workers,
    cpuTimeMs: 0,
    otherWaitMs: options.holdMs,
    timeDistribution: options.distribution ?? "exponential",
    queueLimit: options.queueLimit ?? 100,
  };
}
