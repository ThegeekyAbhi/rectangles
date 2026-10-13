import { describe, expect, it } from "vitest";
import { runSimulation } from "../../../src/kernel/simulation.ts";
import type { RunResult } from "../../../src/metrics/run-result.ts";
import { registry } from "../../../src/registry.ts";
import { buildClientApiServerDesign } from "../../support/client-api-server-design.ts";
import { expectRequestsConserved } from "../../support/expect-requests-conserved.ts";
import { findCounter, findGauge, findSample } from "../../support/find-metric.ts";
import {
  blockingProbabilityMm1k,
  erlangC,
  meanWaitSecondsMmc,
} from "../../support/queueing-formulas.ts";

/**
 * Poisson arrivals into exponential servers is the textbook M/M/c queue, whose mean wait
 * is known exactly. These tests hold the engine to that answer.
 *
 * The runs exceed the product's event budget, because the mean wait of a busy queue
 * converges slowly; the budget is a product limit, not part of the model.
 */
const SEEDS = [1, 2, 3];
const TOLERANCE = 0.05;
const UNLIMITED_EVENTS = { maxEvents: Number.MAX_SAFE_INTEGER };
const TEST_TIMEOUT_MS = 30_000;

interface QueueScenario {
  readonly arrivalsPerSecond: number;
  readonly serviceTimeMs: number;
  readonly instances: number;
  readonly concurrency: number;
  readonly queueLimit: number;
  readonly durationSeconds: number;
}

function runQueue(scenario: QueueScenario, seed: number): RunResult {
  const result = runSimulation(
    buildClientApiServerDesign({
      client: { ratePerSecond: scenario.arrivalsPerSecond, timeoutMs: 600_000 },
      apiServer: {
        instances: scenario.instances,
        concurrency: scenario.concurrency,
        serviceTimeMs: scenario.serviceTimeMs,
        queueLimit: scenario.queueLimit,
      },
      durationSeconds: scenario.durationSeconds,
      seed,
    }),
    { registry, limits: UNLIMITED_EVENTS },
  );
  expectRequestsConserved(result);
  return result;
}

function expectWithinTolerance(observed: number, expected: number): void {
  expect(Math.abs(observed - expected) / expected).toBeLessThan(TOLERANCE);
}

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

  it.each(SEEDS)("matches the mean wait, latency, queue length and utilisation (seed %i)", (seed) => {
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
  }, TEST_TIMEOUT_MS);
});

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

  it.each(SEEDS)("matches the Erlang C mean wait and probability of waiting (seed %i)", (seed) => {
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
  }, TEST_TIMEOUT_MS);
});

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

  it.each(SEEDS)("rejects the textbook share of arrivals (seed %i)", (seed) => {
    const result = runQueue(scenario, seed);
    const rejected = findCounter(result, "api", "requests.rejected").total;

    expectWithinTolerance(rejected / result.summary.offered, expectedBlocking);
    expect(result.summary.rejected).toBe(rejected);
  }, TEST_TIMEOUT_MS);
});
