import { describe, expect, it } from "vitest";
import { apiServerDefinition } from "../../../src/components/api-server/definition.ts";
import { runSimulation } from "../../../src/kernel/simulation.ts";
import type { RunResult } from "../../../src/metrics/run-result.ts";
import { registry } from "../../../src/registry.ts";
import type { ClientApiServerDesignOptions } from "../../support/client-api-server-design.ts";
import { buildClientApiServerDesign } from "../../support/client-api-server-design.ts";
import { expectRequestsConserved } from "../../support/expect-requests-conserved.ts";
import { findCounter, findGauge, findSample } from "../../support/find-metric.ts";

function run(options: ClientApiServerDesignOptions): RunResult {
  const result = runSimulation(buildClientApiServerDesign(options), { registry });
  expectRequestsConserved(result);
  return result;
}

// Defaults: 2 instances × 50 concurrency ÷ 20 ms = 5,000 requests/s of capacity.
const CAPACITY_PER_SECOND = 5000;

describe("api server below capacity", () => {
  const result = run({ client: { ratePerSecond: 3000 }, durationSeconds: 20 });

  it("answers every request without queueing or rejecting", () => {
    expect(result.summary.rejected).toBe(0);
    expect(findCounter(result, "api", "requests.rejected").total).toBe(0);
    expect(findGauge(result, "api", "queue.depth").max).toBe(0);
    expect(findSample(result, "api", "queue.wait").max).toBe(0);
  });

  it("reports utilisation as offered load ÷ capacity", () => {
    expect(findGauge(result, "api", "utilisation").mean).toBeCloseTo(3000 / CAPACITY_PER_SECOND, 1);
  });

  it("takes the service time on average", () => {
    expect(result.summary.latencyMs.mean / 20).toBeCloseTo(1, 1);
  });
});

describe("api server above capacity", () => {
  const result = run({ client: { ratePerSecond: 6000 }, durationSeconds: 20 });

  it("runs every slot flat out", () => {
    const utilisation = findGauge(result, "api", "utilisation");
    expect(utilisation.max).toBe(1);
    // Skip the first second, while the server is still filling up.
    for (const windowMean of utilisation.windows.slice(1)) {
      expect(windowMean).toBeGreaterThan(0.99);
    }
  });

  it("fills its queue to the limit and no further", () => {
    expect(findGauge(result, "api", "queue.depth").max).toBe(100);
    expect(findGauge(result, "api", "queue.depth").mean).toBeGreaterThan(90);
  });

  it("rejects the load it cannot carry", () => {
    const excessPerSecond = 6000 - CAPACITY_PER_SECOND;
    expect(result.summary.rejected / 20 / excessPerSecond).toBeCloseTo(1, 0);
    expect(result.summary.rejected).toBe(findCounter(result, "api", "requests.rejected").total);
  });

  it("delivers its capacity as throughput", () => {
    expect(result.summary.throughputPerSecond / CAPACITY_PER_SECOND).toBeCloseTo(1, 1);
  });

  it("adds queueing time to latency", () => {
    // A full queue of 100 drains at 5,000/s, so a request waits about 20 ms for a slot.
    expect(findSample(result, "api", "queue.wait").mean / 20).toBeCloseTo(1, 0);
    expect(result.summary.latencyMs.p99).toBeGreaterThan(60);
  });
});

describe("api server capacity arithmetic", () => {
  it("moves the saturation point by one instance's worth when an instance is added", () => {
    const load = { client: { ratePerSecond: 6000 }, durationSeconds: 20 };
    const twoInstances = run({ ...load, apiServer: { instances: 2 } });
    const threeInstances = run({ ...load, apiServer: { instances: 3 } });

    // 3 × 50 ÷ 20 ms = 7,500 requests/s, comfortably above the 6,000 offered.
    expect(twoInstances.summary.rejected).toBeGreaterThan(10_000);
    expect(threeInstances.summary.rejected).toBe(0);
    expect(findGauge(threeInstances, "api", "utilisation").mean).toBeCloseTo(6000 / 7500, 1);
  });

  it("serves in arrival order", () => {
    // One slot and constant work: the nth request finishes n service times in.
    const result = run({
      client: { ratePerSecond: 50 },
      apiServer: {
        instances: 1,
        concurrency: 1,
        serviceTimeMs: 10,
        serviceTimeDistribution: "constant",
        queueLimit: 1000,
      },
      durationSeconds: 20,
    });
    const wait = findSample(result, "api", "queue.wait");
    expect(result.summary.latencyMs.mean).toBeCloseTo(wait.mean + 10, 6);
    expect(result.summary.latencyMs.max).toBeCloseTo(wait.max + 10, 6);
  });

  it("rejects immediately with no queue when every slot is busy", () => {
    const result = run({
      client: { ratePerSecond: 1000 },
      apiServer: { instances: 1, concurrency: 1, serviceTimeMs: 10, queueLimit: 0 },
    });
    expect(result.summary.rejected).toBeGreaterThan(0);
    expect(findGauge(result, "api", "queue.depth").max).toBe(0);
    expect(findSample(result, "api", "queue.wait").max).toBe(0);
  });
});

describe("determinism", () => {
  const options = { client: { ratePerSecond: 2000 }, durationSeconds: 5 };

  it("gives byte-identical results for the same design and seed", () => {
    const first = JSON.stringify(run({ ...options, seed: 7 }));
    const second = JSON.stringify(run({ ...options, seed: 7 }));
    expect(second).toBe(first);
  });

  it("gives different results for a different seed", () => {
    expect(JSON.stringify(run({ ...options, seed: 8 }))).not.toBe(
      JSON.stringify(run({ ...options, seed: 7 })),
    );
  });

  it("keeps a client's arrivals unchanged when another node's config changes", () => {
    const baseline = run({ ...options, seed: 7 });
    const variant = run({ ...options, seed: 7, apiServer: { instances: 5, serviceTimeMs: 3 } });
    expect(findCounter(variant, "client", "end-to-end.offered").windows).toEqual(
      findCounter(baseline, "client", "end-to-end.offered").windows,
    );
  });

  it("matches the recorded results of a reference run", () => {
    const result = run({ ...options, seed: 7, apiServer: { instances: 1, concurrency: 30 } });
    expect({ eventsProcessed: result.eventsProcessed, summary: result.summary }).toMatchSnapshot();
  });
});

describe("summary", () => {
  it("gives the slots and the service time", () => {
    expect(
      apiServerDefinition.summarise({
        instances: 4,
        concurrency: 1_500,
        serviceTimeMs: 12.5,
        serviceTimeDistribution: "exponential",
        queueLimit: 100,
      }),
    ).toBe("4 × 1.5K slots · 12.5 ms");
  });

  it("gives a long service time in seconds", () => {
    expect(
      apiServerDefinition.summarise({
        instances: 2,
        concurrency: 50,
        serviceTimeMs: 2_000,
        serviceTimeDistribution: "constant",
        queueLimit: 100,
      }),
    ).toBe("2 × 50 slots · 2 s");
  });
});
