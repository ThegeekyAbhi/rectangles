import { describe, expect, it } from "vitest";
import { findCounter } from "../../../support/find-metric.ts";
import { blockingProbabilityMm1k } from "../../../support/queueing-formulas.ts";
import {
  expectWithinTolerance,
  QUEUE_SEEDS,
  runQueue,
} from "../../../support/run-queue-scenario.ts";

describe("M/M/1/K: one server with room for four to wait, 90% utilised", () => {
  const scenario = {
    arrivalsPerSecond: 4500,
    serviceTimeMs: 0.2,
    instances: 1,
    concurrency: 1,
    queueLimit: 4,
    durationSeconds: 60,
  };
  const expectedBlocking = blockingProbabilityMm1k(0.9, 1 + scenario.queueLimit);

  it.each(QUEUE_SEEDS)("rejects the textbook share of arrivals (seed %i)", (seed) => {
    const result = runQueue(scenario, seed);
    const rejected = findCounter(result, "api", "requests.rejected").total;

    expectWithinTolerance(rejected / result.summary.offered, expectedBlocking);
    expect(result.summary.rejected).toBe(rejected);
  });
});
