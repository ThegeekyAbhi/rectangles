import type { RunResult, RunSnapshot, SimulationDesign } from "@rectangles/engine";
import { createSimulation, registry, runSimulation } from "@rectangles/engine";

/** One client calling one API server that is too small for the traffic. */
export const overloadedDesign: SimulationDesign = {
  schemaVersion: 1,
  run: { durationSeconds: 4, seed: 1 },
  nodes: [
    { id: "client", type: "client", config: { ratePerSecond: 400 } },
    {
      id: "api",
      type: "api-server",
      config: { workers: 4, cpuTimeMs: 0, otherWaitMs: 12, queueLimit: 10 },
    },
  ],
  edges: [{ id: "client-to-api", from: { node: "client", port: "out" }, to: { node: "api", port: "in" } }],
};

export function runToEnd(design: SimulationDesign = overloadedDesign): RunResult {
  return runSimulation(design, { registry });
}

/** Snapshots of one run, taken the way the worker takes them: each from the given window. */
export function takeSnapshots(steps: readonly { untilSeconds: number; fromWindow: number }[]): RunSnapshot[] {
  const simulation = createSimulation(overloadedDesign, { registry });
  return steps.map(({ untilSeconds, fromWindow }) => {
    simulation.step(untilSeconds * 1_000_000);
    return simulation.snapshot(fromWindow);
  });
}
