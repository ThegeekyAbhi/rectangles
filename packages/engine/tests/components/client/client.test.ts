import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import type { ClientConfig } from "../../../src/components/client/definition.ts";
import { clientDefinition } from "../../../src/components/client/definition.ts";
import { validateConfig } from "../../../src/kernel/config-validation.ts";
import { runSimulation } from "../../../src/kernel/simulation.ts";
import type { RunResult } from "../../../src/metrics/run-result.ts";
import { registry } from "../../../src/registry.ts";
import type { ClientApiServerDesignOptions } from "../../support/client-api-server-design.ts";
import { buildClientApiServerDesign } from "../../support/client-api-server-design.ts";
import { expectRequestsConserved } from "../../support/expect-requests-conserved.ts";
import { findCounter } from "../../support/find-metric.ts";

function run(options: ClientApiServerDesignOptions): RunResult {
  const result = runSimulation(buildClientApiServerDesign(options), { registry });
  expectRequestsConserved(result);
  return result;
}

/** Sum of a counter's windows from `fromSecond` up to, not including, `toSecond`. */
function offeredBetween(result: RunResult, fromSecond: number, toSecond: number): number {
  return findCounter(result, "client", "end-to-end.offered")
    .windows.slice(fromSecond, toSecond)
    .reduce((sum, count) => sum + count, 0);
}

/** A Poisson count's standard deviation is the square root of its mean; allow four. */
function expectPoissonCount(observed: number, expected: number): void {
  expect(Math.abs(observed - expected)).toBeLessThan(4 * Math.sqrt(expected));
}

describe("client traffic", () => {
  it("offers the configured steady rate", () => {
    const result = run({ client: { ratePerSecond: 400 }, durationSeconds: 60 });
    expectPoissonCount(result.summary.offered, 400 * 60);
    expect(result.summary.offeredPerSecond).toBe(result.summary.offered / 60);
  });

  it("generates arrivals whose gaps vary like a Poisson process", () => {
    const { windows } = findCounter(
      run({ client: { ratePerSecond: 400 }, durationSeconds: 120 }),
      "client",
      "end-to-end.offered",
    );
    const mean = windows.reduce((sum, count) => sum + count, 0) / windows.length;
    const variance =
      windows.reduce((sum, count) => sum + (count - mean) ** 2, 0) / (windows.length - 1);
    // For a Poisson process the count per second has variance equal to its mean.
    expect(variance / mean).toBeGreaterThan(0.7);
    expect(variance / mean).toBeLessThan(1.3);
  });

  it("offers nothing at rate zero", () => {
    expect(run({ client: { ratePerSecond: 0 } }).summary.offered).toBe(0);
  });

  it("offers nothing when it is connected to nothing", () => {
    const design = { ...buildClientApiServerDesign(), edges: [] };
    expect(runSimulation(design, { registry }).summary.offered).toBe(0);
  });

  it("steps to the target rate at the change time", () => {
    const result = run({
      client: { pattern: "step", ratePerSecond: 200, targetRatePerSecond: 1000, changeAtSeconds: 10 },
      durationSeconds: 20,
    });
    expectPoissonCount(offeredBetween(result, 0, 10), 2000);
    expectPoissonCount(offeredBetween(result, 10, 20), 10_000);
  });

  it("raises the rate only during a spike", () => {
    const result = run({
      client: {
        pattern: "spike",
        ratePerSecond: 200,
        targetRatePerSecond: 1000,
        changeAtSeconds: 5,
        changeDurationSeconds: 5,
      },
      durationSeconds: 20,
    });
    expectPoissonCount(offeredBetween(result, 0, 5), 1000);
    expectPoissonCount(offeredBetween(result, 5, 10), 5000);
    expectPoissonCount(offeredBetween(result, 10, 20), 2000);
  });

  it("ramps linearly to the target rate", () => {
    const result = run({
      client: {
        pattern: "ramp",
        ratePerSecond: 0,
        targetRatePerSecond: 1000,
        changeAtSeconds: 0,
        changeDurationSeconds: 20,
      },
      durationSeconds: 20,
    });
    // The rate is the integral of a straight line: a quarter of the total by half time.
    expectPoissonCount(offeredBetween(result, 0, 10), 2500);
    expectPoissonCount(offeredBetween(result, 10, 20), 7500);
  });
});

describe("client timeouts and retries", () => {
  // Constant 50 ms of work against a 10 ms timeout: every request times out.
  const alwaysTooSlow = {
    apiServer: { serviceTimeMs: 50, serviceTimeDistribution: "constant" },
    durationSeconds: 10,
  } as const;

  it("counts a request as timed out when no answer arrives in time", () => {
    const result = run({ ...alwaysTooSlow, client: { timeoutMs: 10 } });
    const { offered, timedOut, succeeded, inFlight } = result.summary;

    expect(succeeded).toBe(0);
    expect(timedOut + inFlight).toBe(offered);
    expect(result.summary.errorRate).toBeCloseTo(1, 2);
    expect(result.summary.latencyMs.count).toBe(0);
  });

  it("keeps the server working on requests the client has given up on", () => {
    const result = run({ ...alwaysTooSlow, client: { timeoutMs: 10 } });
    expect(findCounter(result, "api", "requests.completed").total).toBeGreaterThan(
      0.99 * result.summary.timedOut,
    );
  });

  it("does not time out a request answered just in time", () => {
    const result = run({ ...alwaysTooSlow, client: { timeoutMs: 50.001 } });
    expect(result.summary.timedOut).toBe(0);
    expect(result.summary.latencyMs).toMatchObject({ p50: 50, max: 50 });
  });

  it("offers each retry as new load", () => {
    const withoutRetries = run({ ...alwaysTooSlow, client: { timeoutMs: 10 } });
    const withRetries = run({
      ...alwaysTooSlow,
      client: { timeoutMs: 10, retries: 2, retryBackoffMs: 1 },
    });
    // The same seed gives the same first attempts, each followed by two retries.
    // Attempts cut off by the end of the run account for the small shortfall.
    const firstAttempts = withoutRetries.summary.offered;
    expect(withRetries.summary.offered).toBeLessThanOrEqual(3 * firstAttempts);
    expect(withRetries.summary.offered).toBeGreaterThan(3 * firstAttempts - 10);
  });

  it("retries rejected requests", () => {
    const overloaded = {
      apiServer: { instances: 1, concurrency: 1, serviceTimeMs: 100, queueLimit: 0 },
      durationSeconds: 10,
    };
    const withoutRetries = run({ ...overloaded, client: { ratePerSecond: 200 } });
    const withRetries = run({ ...overloaded, client: { ratePerSecond: 200, retries: 1 } });

    expect(withoutRetries.summary.rejected).toBeGreaterThan(0);
    expect(withRetries.summary.offered).toBeGreaterThan(1.8 * withoutRetries.summary.offered);
  });
});

describe("request conservation", () => {
  test.prop(
    [
      fc.record({
        pattern: fc.constantFrom("steady", "ramp", "spike", "step"),
        ratePerSecond: fc.integer({ min: 0, max: 2000 }),
        targetRatePerSecond: fc.integer({ min: 0, max: 2000 }),
        changeAtSeconds: fc.double({ min: 0, max: 2, noNaN: true }),
        changeDurationSeconds: fc.double({ min: 0, max: 2, noNaN: true }),
        timeoutMs: fc.double({ min: 1, max: 100, noNaN: true }),
        retries: fc.integer({ min: 0, max: 2 }),
        retryBackoffMs: fc.double({ min: 0, max: 20, noNaN: true }),
      }),
      fc.record({
        instances: fc.integer({ min: 1, max: 3 }),
        concurrency: fc.integer({ min: 1, max: 4 }),
        serviceTimeMs: fc.double({ min: 0.1, max: 60, noNaN: true }),
        serviceTimeDistribution: fc.constantFrom("exponential", "constant"),
        queueLimit: fc.integer({ min: 0, max: 20 }),
      }),
      fc.integer({ min: 0, max: 1_000_000 }),
    ],
    { numRuns: 150 },
  )("accounts for every offered request, whatever the configuration", (client, apiServer, seed) => {
    const result = runSimulation(
      buildClientApiServerDesign({ client, apiServer, seed, durationSeconds: 3 }),
      { registry },
    );

    expectRequestsConserved(result);
    // The client and the server must agree on what happened to the server's work.
    const api = result.nodes[1]?.calls;
    const completed = findCounter(result, "api", "requests.completed").total;
    const rejected = findCounter(result, "api", "requests.rejected").total;
    expect(api?.received).toBe(result.summary.offered);
    expect(completed + rejected).toBe(api?.replied);
  });
});

describe("summary", () => {
  const defaults = clientDefinition.configFields;

  it("gives the rate and pattern of steady traffic", () => {
    expect(
      clientDefinition.summarise({
        pattern: "steady",
        ratePerSecond: 2_500,
        targetRatePerSecond: defaults.targetRatePerSecond.default,
        changeAtSeconds: defaults.changeAtSeconds.default,
        changeDurationSeconds: defaults.changeDurationSeconds.default,
        timeoutMs: defaults.timeoutMs.default,
        retries: defaults.retries.default,
        retryBackoffMs: defaults.retryBackoffMs.default,
      }),
    ).toBe("2.5K req/s · steady");
  });

  it("gives both rates of a pattern that changes", () => {
    const validation = validateConfig(defaults, { pattern: "ramp" });
    expect(validation.ok && clientDefinition.summarise(validation.config as ClientConfig)).toBe(
      "100 → 500 req/s · ramp",
    );
  });
});
