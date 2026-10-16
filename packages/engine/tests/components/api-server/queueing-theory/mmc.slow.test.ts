import { describe, expect, it } from "vitest";
import { findGauge, findSample } from "../../../support/find-metric.ts";
import { erlangC, meanWaitSecondsMmc } from "../../../support/queueing-formulas.ts";
import {
  expectWithinTolerance,
  QUEUE_SEEDS,
  runQueue,
} from "../../../support/run-queue-scenario.ts";

describe("M/M/c: ten servers, 80% utilised", () => {
  const scenario = {
    arrivalsPerSecond: 4000,
    serviceTimeMs: 2,
    instances: 2,
    concurrency: 5,
    queueLimit: 1_000_000,
    durationSeconds: 120,
  };
  const serverCount = scenario.instances * scenario.concurrency;
  const servicesPerSecond = 1000 / scenario.serviceTimeMs;
  const expectedWaitMs =
    1000 * meanWaitSecondsMmc(scenario.arrivalsPerSecond, servicesPerSecond, serverCount);

  it.each(QUEUE_SEEDS)("matches the Erlang C mean wait and probability of waiting (seed %i)", (seed) => {
    const result = runQueue(scenario, seed);
    const wait = findSample(result, "api", "queue.wait");

    expect(result.summary.rejected).toBe(0);
    expectWithinTolerance(wait.mean, expectedWaitMs);
    expectWithinTolerance(result.summary.latencyMs.mean, expectedWaitMs + scenario.serviceTimeMs);
    expectWithinTolerance(findGauge(result, "api", "utilisation").mean, 0.8);

    // Erlang C is the share of arrivals that find every server busy. It is 41% here,
    // so the median request does not wait while the 95th percentile does.
    expect(erlangC(serverCount, scenario.arrivalsPerSecond / servicesPerSecond)).toBeCloseTo(0.409, 3);
    expect(wait.p50).toBe(0);
    expect(wait.p95).toBeGreaterThan(0);
  });
});
