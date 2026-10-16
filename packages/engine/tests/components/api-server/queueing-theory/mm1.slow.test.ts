import { describe, expect, it } from "vitest";
import { findGauge, findSample } from "../../../support/find-metric.ts";
import { meanWaitSecondsMmc } from "../../../support/queueing-formulas.ts";
import {
  expectWithinTolerance,
  QUEUE_SEEDS,
  runQueue,
} from "../../../support/run-queue-scenario.ts";

describe("M/M/1: one server, 80% utilised", () => {
  const scenario = {
    arrivalsPerSecond: 4000,
    serviceTimeMs: 0.2,
    instances: 1,
    concurrency: 1,
    queueLimit: 1_000_000,
    durationSeconds: 300,
  };
  const servicesPerSecond = 1000 / scenario.serviceTimeMs;
  const expectedWaitMs = 1000 * meanWaitSecondsMmc(scenario.arrivalsPerSecond, servicesPerSecond, 1);

  it("expects the textbook wait of ρ ÷ (μ − λ)", () => {
    expect(expectedWaitMs).toBeCloseTo((1000 * 0.8) / (5000 - 4000), 9);
  });

  it.each(QUEUE_SEEDS)("matches the mean wait, latency, queue length and utilisation (seed %i)", (seed) => {
    const result = runQueue(scenario, seed);

    expect(result.summary.rejected).toBe(0);
    expectWithinTolerance(findSample(result, "api", "queue.wait").mean, expectedWaitMs);
    expectWithinTolerance(result.summary.latencyMs.mean, expectedWaitMs + scenario.serviceTimeMs);
    // Little's law: mean queue length = arrival rate × mean wait.
    expectWithinTolerance(
      findGauge(result, "api", "queue.depth").mean,
      (scenario.arrivalsPerSecond * expectedWaitMs) / 1000,
    );
    expectWithinTolerance(findGauge(result, "api", "utilisation").mean, 0.8);
  });
});
