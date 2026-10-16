import { runSimulation } from "../../src/kernel/simulation.ts";
import type { SimulationDesign } from "../../src/kernel/design-graph.ts";
import type { RunResult } from "../../src/metrics/run-result.ts";
import { registry } from "../../src/registry.ts";
import { expectRequestsConserved } from "./expect-requests-conserved.ts";

/** No event limit: some tests run past the product's budget on purpose. */
const UNLIMITED_EVENTS = { maxEvents: Number.MAX_SAFE_INTEGER };

/** Runs a design to its end with no event limit, checking that every request is accounted for. */
export function runToCompletion(design: SimulationDesign): RunResult {
  const result = runSimulation(design, { registry, limits: UNLIMITED_EVENTS });
  expectRequestsConserved(result);
  return result;
}
