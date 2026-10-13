import { expect } from "vitest";
import type { RunResult } from "../../src/metrics/run-result.ts";

/**
 * Asserts that no request was lost or counted twice: every request offered has exactly
 * one outcome or is still in flight, and no node answered more calls than it received.
 */
export function expectRequestsConserved(result: RunResult): void {
  const { offered, succeeded, rejected, failed, timedOut, inFlight } = result.summary;
  expect(succeeded + rejected + failed + timedOut + inFlight).toBe(offered);
  for (const node of result.nodes) {
    expect(node.calls.inFlight).toBeGreaterThanOrEqual(0);
  }
}
