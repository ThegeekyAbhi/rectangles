import type { SimulationDesign } from "../../src/kernel/design-graph.ts";

export interface ClientApiServerDesignOptions {
  readonly client?: Readonly<Record<string, unknown>>;
  readonly apiServer?: Readonly<Record<string, unknown>>;
  readonly durationSeconds?: number;
  readonly seed?: number;
}

/** The smallest runnable design: one client calling one API server. */
export function buildClientApiServerDesign(
  options: ClientApiServerDesignOptions = {},
): SimulationDesign {
  return {
    schemaVersion: 1,
    run: { durationSeconds: options.durationSeconds ?? 10, seed: options.seed ?? 1 },
    nodes: [
      { id: "client", type: "client", config: options.client ?? {} },
      { id: "api", type: "api-server", config: options.apiServer ?? {} },
    ],
    edges: [
      { id: "client-to-api", from: { node: "client", port: "out" }, to: { node: "api", port: "in" } },
    ],
  };
}
