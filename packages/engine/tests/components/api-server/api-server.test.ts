import { describe, expect, it } from "vitest";
import { apiServerDefinition } from "../../../src/components/api-server/definition.ts";
import { runSimulation } from "../../../src/kernel/simulation.ts";
import type { RunResult } from "../../../src/metrics/run-result.ts";
import { registry } from "../../../src/registry.ts";
import type { ClientApiServerDesignOptions } from "../../support/client-api-server-design.ts";
import { buildClientApiServerDesign } from "../../support/client-api-server-design.ts";
import { expectRequestsConserved } from "../../support/expect-requests-conserved.ts";
import { findCounter, findGauge, findSample } from "../../support/find-metric.ts";
import { slotServer } from "../../support/slot-server.ts";

/** 100 workers ÷ 20 ms = 5,000 requests/s of capacity, with no CPU time to share. */
const SERVER = slotServer({ workers: 100, holdMs: 20 });
const CAPACITY_PER_SECOND = 5000;

function run(options: ClientApiServerDesignOptions): RunResult {
  const result = runSimulation(buildClientApiServerDesign({ apiServer: SERVER, ...options }), { registry });
  expectRequestsConserved(result);
  return result;
}

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

  it("takes its hold time on average", () => {
    expect(result.summary.latencyMs.mean / 20).toBeCloseTo(1, 1);
  });
});

describe("api server above capacity", () => {
  const result = run({ client: { ratePerSecond: 6000 }, durationSeconds: 20 });

  it("runs every worker flat out", () => {
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
    // A full queue of 100 drains at 5,000/s, so a request waits about 20 ms for a worker.
    expect(findSample(result, "api", "queue.wait").mean / 20).toBeCloseTo(1, 0);
    expect(result.summary.latencyMs.p99).toBeGreaterThan(60);
  });
});

describe("api server capacity arithmetic", () => {
  it("moves the saturation point by the workers added", () => {
    const load = { client: { ratePerSecond: 6000 }, durationSeconds: 20 };
    const hundred = run({ ...load, apiServer: slotServer({ workers: 100, holdMs: 20 }) });
    const hundredAndFifty = run({ ...load, apiServer: slotServer({ workers: 150, holdMs: 20 }) });

    // 150 ÷ 20 ms = 7,500 requests/s, comfortably above the 6,000 offered.
    expect(hundred.summary.rejected).toBeGreaterThan(10_000);
    expect(hundredAndFifty.summary.rejected).toBe(0);
    expect(findGauge(hundredAndFifty, "api", "utilisation").mean).toBeCloseTo(6000 / 7500, 1);
  });

  it("serves in arrival order", () => {
    // One worker and constant work: the nth request finishes n hold times in.
    const result = run({
      client: { ratePerSecond: 50 },
      apiServer: slotServer({ workers: 1, holdMs: 10, distribution: "constant", queueLimit: 1000 }),
      durationSeconds: 20,
    });
    const wait = findSample(result, "api", "queue.wait");
    expect(result.summary.latencyMs.mean).toBeCloseTo(wait.mean + 10, 6);
    expect(result.summary.latencyMs.max).toBeCloseTo(wait.max + 10, 6);
  });

  it("rejects immediately with no queue when every worker is busy", () => {
    const result = run({
      client: { ratePerSecond: 1000 },
      apiServer: slotServer({ workers: 1, holdMs: 10, queueLimit: 0 }),
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
    const variant = run({ ...options, seed: 7, apiServer: slotServer({ workers: 250, holdMs: 3 }) });
    expect(findCounter(variant, "client", "end-to-end.offered").windows).toEqual(
      findCounter(baseline, "client", "end-to-end.offered").windows,
    );
  });

  it("matches the recorded results of a reference run", () => {
    const result = run({ ...options, seed: 7, apiServer: slotServer({ workers: 30, holdMs: 20 }) });
    expect({ eventsProcessed: result.eventsProcessed, summary: result.summary }).toMatchSnapshot();
  });
});

describe("cpu", () => {
  // Medium is 4 vCPU; 5 ms of CPU each gives 800 requests/s, far below what 1,000 workers allow.
  const cpuBound = { workers: 1_000, cpuTimeMs: 5, otherWaitMs: 0, timeDistribution: "constant", queueLimit: 10_000 };

  it("completes CPU-bound work at cores ÷ CPU time, with workers to spare", () => {
    const result = run({ client: { ratePerSecond: 1_000 }, apiServer: { ...cpuBound, size: "medium" }, durationSeconds: 20 });
    expect(findGauge(result, "api", "cpu.utilisation").max).toBe(1);
    expect(findGauge(result, "api", "cpu.queue-depth").max).toBeGreaterThan(10);
    expect(findCounter(result, "api", "requests.completed").total / 20).toBeCloseTo(800, -2);
  });

  it("doubles CPU-bound throughput a size up, from 4 to 8 vCPU", () => {
    const result = run({ client: { ratePerSecond: 1_000 }, apiServer: { ...cpuBound, size: "large" }, durationSeconds: 20 });
    // 8 ÷ 5 ms = 1,600 requests/s: now nothing waits for a core.
    expect(findGauge(result, "api", "cpu.utilisation").mean).toBeCloseTo(1_000 / 1_600, 1);
    expect(result.summary.rejected).toBe(0);
  });

  it("holds the worker but not a core while it waits on things off the board", () => {
    const result = run({
      client: { ratePerSecond: 100 },
      apiServer: { workers: 1_000, cpuTimeMs: 1, otherWaitMs: 99, timeDistribution: "constant" },
      durationSeconds: 10,
    });
    // 100/s × 100 ms = 10 workers busy, but 100/s × 1 ms ÷ 4 cores = 2.5% of the CPU.
    expect(findGauge(result, "api", "utilisation").mean).toBeCloseTo(10 / 1_000, 2);
    expect(findGauge(result, "api", "cpu.utilisation").mean).toBeCloseTo(0.025, 2);
    expect(result.summary.latencyMs.mean).toBeCloseTo(100, 0);
  });
});

describe("summary", () => {
  it("gives the size, the workers and the time a request takes", () => {
    expect(
      apiServerDefinition.summarise({
        size: "large",
        workers: 1_500,
        cpuTimeMs: 2.5,
        otherWaitMs: 10,
        timeDistribution: "exponential",
        queueLimit: 100,
      }),
    ).toBe("8 vCPU · 1.5K workers · 12.5 ms");
  });

  it("gives a long time in seconds", () => {
    expect(
      apiServerDefinition.summarise({
        size: "medium",
        workers: 50,
        cpuTimeMs: 0,
        otherWaitMs: 2_000,
        timeDistribution: "constant",
        queueLimit: 100,
      }),
    ).toBe("4 vCPU · 50 workers · 2 s");
  });
});
