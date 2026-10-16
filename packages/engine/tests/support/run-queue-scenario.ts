import { expect } from "vitest";
import type { RunResult } from "../../src/metrics/run-result.ts";
import { buildClientApiServerDesign } from "./client-api-server-design.ts";
import { runToCompletion } from "./run-to-completion.ts";

/**
 * Shared by the queueing-theory tests, which hold the engine to the textbook M/M/c
 * answers. Each queue has its own file, so they run in parallel.
 *
 * The runs exceed the product's event budget, because the mean wait of a busy queue
 * converges slowly; the budget is a product limit, not part of the model.
 */
export const QUEUE_SEEDS = [1, 2, 3];
const TOLERANCE = 0.05;

export interface QueueScenario {
  readonly arrivalsPerSecond: number;
  readonly serviceTimeMs: number;
  readonly instances: number;
  readonly concurrency: number;
  readonly queueLimit: number;
  readonly durationSeconds: number;
}

export function runQueue(scenario: QueueScenario, seed: number): RunResult {
  return runToCompletion(
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
  );
}

export function expectWithinTolerance(observed: number, expected: number): void {
  expect(Math.abs(observed - expected) / expected).toBeLessThan(TOLERANCE);
}
