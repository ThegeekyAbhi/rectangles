import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import type { LoadBalancerConfig } from "../../../src/components/load-balancer/definition.ts";
import {
  loadBalancerConfigFields,
  loadBalancerDefinition,
} from "../../../src/components/load-balancer/definition.ts";
import { validateConfig } from "../../../src/kernel/config-validation.ts";
import type { SimulationDesign } from "../../../src/kernel/design-graph.ts";
import { runSimulation } from "../../../src/kernel/simulation.ts";
import type { RunResult } from "../../../src/metrics/run-result.ts";
import { registry } from "../../../src/registry.ts";
import { expectRequestsConserved } from "../../support/expect-requests-conserved.ts";
import { findCounter, findGauge } from "../../support/find-metric.ts";

type Config = Readonly<Record<string, unknown>>;

interface Target {
  readonly server?: Config;
  readonly weight?: number;
}

interface LoadBalancedDesignOptions {
  readonly client?: Config;
  readonly loadBalancer?: Config;
  /** One API server per entry, connected with the given weight. */
  readonly targets?: readonly Target[];
  readonly durationSeconds?: number;
  readonly seed?: number;
}

/** A client calling a load balancer that spreads requests over API servers `api-0`, `api-1`… */
function buildLoadBalancedDesign(options: LoadBalancedDesignOptions = {}): SimulationDesign {
  const targets = options.targets ?? [{}, {}];
  return {
    schemaVersion: 1,
    run: { durationSeconds: options.durationSeconds ?? 10, seed: options.seed ?? 1 },
    nodes: [
      { id: "client", type: "client", config: options.client ?? {} },
      { id: "lb", type: "load-balancer", config: options.loadBalancer ?? {} },
      ...targets.map((target, index) => ({ id: `api-${index}`, type: "api-server", config: target.server ?? {} })),
    ],
    edges: [
      { id: "client-to-lb", from: { node: "client", port: "out" }, to: { node: "lb", port: "in" } },
      ...targets.map((target, index) => ({
        id: `lb-to-api-${index}`,
        from: { node: "lb", port: "out" },
        to: { node: `api-${index}`, port: "in" },
        config: target.weight === undefined ? {} : { weight: target.weight },
      })),
    ],
  };
}

function run(options: LoadBalancedDesignOptions): RunResult {
  const result = runSimulation(buildLoadBalancedDesign(options), { registry });
  expectRequestsConserved(result);
  return result;
}

function received(result: RunResult, nodeId: string): number {
  return result.nodes.find((node) => node.id === nodeId)?.calls.received ?? 0;
}

function receivedByTarget(result: RunResult, targetCount: number): number[] {
  return Array.from({ length: targetCount }, (_unused, index) => received(result, `api-${index}`));
}

describe("load balancer routing", () => {
  it("splits the client's traffic instead of multiplying it", () => {
    // No added latency, so no request is still on its way to a server when the run ends.
    const result = run({ client: { ratePerSecond: 1000 }, loadBalancer: { latencyMs: 0 }, targets: [{}, {}, {}] });
    const total = receivedByTarget(result, 3).reduce((sum, count) => sum + count, 0);
    expect(total).toBe(result.summary.offered);
    expect(findCounter(result, "lb", "requests.forwarded").total).toBe(total);
  });

  it("gives equal targets equal turns under round robin", () => {
    const counts = receivedByTarget(run({ client: { ratePerSecond: 1000 }, targets: [{}, {}, {}] }), 3);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  // Same speed, very different sizes: 100, 2,500 and 400 slots, weighted to match.
  const unevenCapacity = [
    { server: { instances: 2, concurrency: 50 }, weight: 1 },
    { server: { instances: 5, concurrency: 500 }, weight: 25 },
    { server: { instances: 8, concurrency: 50 }, weight: 4 },
  ];

  function sharesByWeight(algorithm: string): number[] {
    const counts = receivedByTarget(
      run({ client: { ratePerSecond: 3000 }, loadBalancer: { algorithm }, targets: unevenCapacity }),
      3,
    );
    const total = counts.reduce((sum, count) => sum + count, 0);
    return counts.map((count) => count / total);
  }

  it("splits round-robin traffic exactly by weight", () => {
    const [small = 0, large = 0, medium = 0] = sharesByWeight("round-robin");
    expect(small).toBeCloseTo(1 / 30, 3);
    expect(large).toBeCloseTo(25 / 30, 3);
    expect(medium).toBeCloseTo(4 / 30, 3);
  });

  // These follow live load as well as weight, so the split is close but not exact. Least
  // time drifts most: the busiest target answers the most requests, so it also records the
  // most slow outliers, and its peak response time sits a little higher.
  it.each([
    ["least-connections", 0.02],
    ["least-time", 0.05],
  ] as const)("splits %s traffic about by weight", (algorithm, tolerance) => {
    const [small = 0, large = 0, medium = 0] = sharesByWeight(algorithm);
    expect(Math.abs(small - 1 / 30)).toBeLessThan(tolerance);
    expect(Math.abs(large - 25 / 30)).toBeLessThan(tolerance);
    expect(Math.abs(medium - 4 / 30)).toBeLessThan(tolerance);
  });

  // One fast server and one ten times slower, each with 10 slots: 500 + 50 requests/s.
  const fastAndSlow = [
    { server: { instances: 1, concurrency: 10, serviceTimeMs: 20, queueLimit: 1000 } },
    { server: { instances: 1, concurrency: 10, serviceTimeMs: 200, queueLimit: 1000 } },
  ];

  // Health checks and retries off, so only the algorithm decides where traffic goes.
  const algorithmOnly = { failuresToEject: 0, triesPerRequest: 1 };

  it("keeps round-robin traffic flowing to a slow target", () => {
    const result = run({
      client: { ratePerSecond: 300 },
      loadBalancer: algorithmOnly,
      targets: fastAndSlow,
      durationSeconds: 20,
    });
    const [fast = 0, slow = 0] = receivedByTarget(result, 2);
    expect(Math.abs(fast - slow)).toBeLessThanOrEqual(1);
    expect(findGauge(result, "api-1", "utilisation").max).toBe(1);
  });

  it.each(["least-connections", "least-time"] as const)("steers %s traffic away from a slow target", (algorithm) => {
    const roundRobin = run({
      client: { ratePerSecond: 300 },
      loadBalancer: algorithmOnly,
      targets: fastAndSlow,
      durationSeconds: 20,
    });
    const result = run({
      client: { ratePerSecond: 300 },
      loadBalancer: { algorithm, ...algorithmOnly },
      targets: fastAndSlow,
      durationSeconds: 20,
    });
    const [fast = 0, slow = 0] = receivedByTarget(result, 2);
    expect(fast).toBeGreaterThan(3 * slow);
    expect(result.summary.latencyMs.p99).toBeLessThan(roundRobin.summary.latencyMs.p99 / 5);
  });
});

describe("load balancer retries and health checks", () => {
  // One server that refuses almost everything next to one with plenty of room.
  const refusing = { server: { instances: 1, concurrency: 1, serviceTimeMs: 600_000, queueLimit: 0 } };
  const oneRefusing = [refusing, { server: {} }];

  it("retries a refused request on another target", () => {
    const withoutRetry = run({
      client: { ratePerSecond: 200 },
      loadBalancer: { triesPerRequest: 1, failuresToEject: 0 },
      targets: oneRefusing,
    });
    const withRetry = run({
      client: { ratePerSecond: 200 },
      loadBalancer: { triesPerRequest: 2, failuresToEject: 0 },
      targets: oneRefusing,
    });
    expect(withoutRetry.summary.errorRate).toBeGreaterThan(0.4);
    expect(withRetry.summary.rejected).toBe(0);
    expect(findCounter(withRetry, "lb", "requests.retried").total).toBeGreaterThan(0);
  });

  it("ejects a target that keeps refusing, then brings it back after the ejection time", () => {
    const result = run({
      client: { ratePerSecond: 200 },
      loadBalancer: { triesPerRequest: 1, failuresToEject: 5, ejectionSeconds: 3 },
      targets: oneRefusing,
      durationSeconds: 10,
    });
    const ejected = findGauge(result, "lb", "targets.ejected");
    expect(ejected.max).toBe(1);
    // Ejected about 3 s out of every 3 s + a few refusals: mostly out of rotation.
    expect(ejected.mean).toBeGreaterThan(0.8);
    expect(findCounter(result, "lb", "targets.ejections").total).toBeGreaterThanOrEqual(3);
    // Five refusals per ejection reach the client; everything else succeeds.
    expect(result.summary.rejected).toBeLessThan(5 * 5);
  });

  it("keeps sending to ejected targets when every target is ejected", () => {
    const result = run({
      client: { ratePerSecond: 200 },
      loadBalancer: { failuresToEject: 1 },
      targets: [refusing],
    });
    expect(findGauge(result, "lb", "targets.ejected").max).toBe(1);
    expect(received(result, "api-0")).toBe(result.summary.offered);
  });
});

describe("load balancer limits", () => {
  it("adds its latency to every request", () => {
    const result = run({
      loadBalancer: { latencyMs: 2 },
      targets: [{ server: { serviceTimeMs: 10, serviceTimeDistribution: "constant" } }],
    });
    expect(result.summary.latencyMs).toMatchObject({ p50: 12, max: 12 });
  });

  it("rejects requests beyond its connection limit", () => {
    const result = run({
      client: { ratePerSecond: 500 },
      loadBalancer: { maxConnections: 5 },
      targets: [{ server: { serviceTimeMs: 100, serviceTimeDistribution: "constant" } }],
    });
    const rejected = findCounter(result, "lb", "requests.rejected").total;
    expect(rejected).toBeGreaterThan(0);
    expect(result.summary.rejected).toBe(rejected);
    expect(findGauge(result, "lb", "connections.open").max).toBe(5);
    expect(findGauge(result, "lb", "utilisation").max).toBe(1);
  });

  it("rejects everything when nothing is behind it", () => {
    const result = run({ targets: [] });
    expect(result.summary.offered).toBeGreaterThan(0);
    expect(result.summary.rejected).toBe(result.summary.offered);
  });
});

describe("request conservation", () => {
  test.prop(
    [
      fc.constantFrom(...loadBalancerConfigFields.algorithm.options),
      fc.record({
        latencyMs: fc.double({ min: 0, max: 5, noNaN: true }),
        maxConnections: fc.integer({ min: 1, max: 50 }),
        triesPerRequest: fc.integer({ min: 1, max: 3 }),
        failuresToEject: fc.integer({ min: 0, max: 5 }),
        ejectionSeconds: fc.double({ min: 1, max: 2, noNaN: true }),
      }),
      fc.array(
        fc.record({
          weight: fc.integer({ min: 1, max: 10 }),
          server: fc.record({
            concurrency: fc.integer({ min: 1, max: 4 }),
            serviceTimeMs: fc.double({ min: 0.1, max: 60, noNaN: true }),
            queueLimit: fc.integer({ min: 0, max: 20 }),
          }),
        }),
        { minLength: 1, maxLength: 4 },
      ),
      fc.integer({ min: 0, max: 1_000_000 }),
    ],
    { numRuns: 100 },
  )("accounts for every request, whatever the configuration", (algorithm, settings, targets, seed) => {
    const result = run({
      client: { ratePerSecond: 500, timeoutMs: 50, retries: 1 },
      loadBalancer: { algorithm, ...settings },
      targets,
      seed,
      durationSeconds: 3,
    });
    const lb = result.nodes.find((node) => node.id === "lb")?.calls;
    const forwarded = findCounter(result, "lb", "requests.forwarded").total;
    const totalReceived = receivedByTarget(result, targets.length).reduce((sum, count) => sum + count, 0);
    expect(lb?.received).toBe(result.summary.offered);
    expect(forwarded).toBe(totalReceived);
  });
});

describe("summary", () => {
  it("gives the algorithm and connection limit", () => {
    const validation = validateConfig(loadBalancerDefinition.configFields, { algorithm: "least-time" });
    expect(validation.ok && loadBalancerDefinition.summarise(validation.config as LoadBalancerConfig)).toBe(
      "least time · 10K conns",
    );
  });
});
