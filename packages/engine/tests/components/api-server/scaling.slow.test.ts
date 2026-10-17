import { describe, expect, it } from "vitest";
import type { SimulationDesign } from "../../../src/kernel/design-graph.ts";
import { buildClientApiServerDesign } from "../../support/client-api-server-design.ts";
import { findCounter } from "../../support/find-metric.ts";
import { runToCompletion } from "../../support/run-to-completion.ts";

/**
 * Scaling up only helps when the CPU is the limit; scaling out and more workers help when
 * waiting is. Every server here is offered far more than it can do, so its throughput is
 * its capacity, and each is checked against the textbook figure: cores ÷ CPU time, or
 * workers ÷ (CPU time + other wait), whichever is lower.
 */
const DURATION_SECONDS = 60;
const OFFERED_PER_SECOND = 3_000;
const TOLERANCE = 0.05;

interface Server {
  readonly size: "medium" | "large";
  readonly workers: number;
  readonly cpuTimeMs: number;
  readonly otherWaitMs: number;
}

const CORES = { medium: 4, large: 8 } as const;

function capacityPerSecond(server: Server): number {
  const byCores = CORES[server.size] / (server.cpuTimeMs / 1_000);
  const byWorkers = server.workers / ((server.cpuTimeMs + server.otherWaitMs) / 1_000);
  return Math.min(byCores, byWorkers);
}

/** Requests the servers completed per second. */
function completedPerSecond(design: SimulationDesign, serverIds: readonly string[]): number {
  const result = runToCompletion(design);
  const completed = serverIds.reduce((total, id) => total + findCounter(result, id, "requests.completed").total, 0);
  return completed / DURATION_SECONDS;
}

function oneServer(server: Server): SimulationDesign {
  return buildClientApiServerDesign({
    client: { ratePerSecond: OFFERED_PER_SECOND, timeoutMs: 600_000 },
    apiServer: { ...server, queueLimit: 100 },
    durationSeconds: DURATION_SECONDS,
  });
}

/** Two copies of a server behind a round-robin load balancer: scaling out. */
function twoCopies(server: Server): SimulationDesign {
  return {
    schemaVersion: 1,
    run: { durationSeconds: DURATION_SECONDS, seed: 1 },
    nodes: [
      { id: "client", type: "client", config: { ratePerSecond: OFFERED_PER_SECOND, timeoutMs: 600_000 } },
      { id: "lb", type: "load-balancer", config: { triesPerRequest: 1, failuresToEject: 0 } },
      { id: "api", type: "api-server", config: { ...server, queueLimit: 100 } },
      { id: "api-2", type: "api-server", config: { ...server, queueLimit: 100 } },
    ],
    edges: [
      { id: "client-to-lb", from: { node: "client", port: "out" }, to: { node: "lb", port: "in" } },
      { id: "lb-to-api", from: { node: "lb", port: "out" }, to: { node: "api", port: "in" } },
      { id: "lb-to-api-2", from: { node: "lb", port: "out" }, to: { node: "api-2", port: "in" } },
    ],
  };
}

function expectNear(observed: number, expected: number): void {
  expect(Math.abs(observed - expected) / expected).toBeLessThan(TOLERANCE);
}

describe("scaling a CPU-heavy server: 15 ms computing, 5 ms waiting", () => {
  const medium: Server = { size: "medium", workers: 1_000, cpuTimeMs: 15, otherWaitMs: 5 };

  it("serves cores ÷ CPU time, and twice that a size up", () => {
    const atMedium = completedPerSecond(oneServer(medium), ["api"]);
    const atLarge = completedPerSecond(oneServer({ ...medium, size: "large" }), ["api"]);
    expectNear(atMedium, capacityPerSecond(medium));
    expectNear(atLarge, capacityPerSecond({ ...medium, size: "large" }));
    expectNear(atLarge / atMedium, 2);
  });
});

describe("scaling an I/O-heavy server: 2 ms computing, 50 ms waiting, workers the limit", () => {
  const medium: Server = { size: "medium", workers: 40, cpuTimeMs: 2, otherWaitMs: 50 };

  it("gains nothing a size up, because no request is waiting for a core", () => {
    const atMedium = completedPerSecond(oneServer(medium), ["api"]);
    const atLarge = completedPerSecond(oneServer({ ...medium, size: "large" }), ["api"]);
    expectNear(atMedium, capacityPerSecond(medium));
    expectNear(atLarge / atMedium, 1);
  });

  it("doubles with twice the workers, or with a second copy behind a load balancer", () => {
    const atMedium = completedPerSecond(oneServer(medium), ["api"]);
    const moreWorkers = completedPerSecond(oneServer({ ...medium, workers: 80 }), ["api"]);
    const scaledOut = completedPerSecond(twoCopies(medium), ["api", "api-2"]);
    expectNear(moreWorkers / atMedium, 2);
    expectNear(scaledOut / atMedium, 2);
  });
});
