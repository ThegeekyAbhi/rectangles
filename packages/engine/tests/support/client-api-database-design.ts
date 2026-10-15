import type { SimulationDesign } from "../../src/kernel/design-graph.ts";

export interface ClientApiDatabaseDesignOptions {
  readonly client?: Readonly<Record<string, unknown>>;
  /** Defaults to an API server too fast and wide to ever be the bottleneck. */
  readonly apiServer?: Readonly<Record<string, unknown>>;
  readonly database?: Readonly<Record<string, unknown>>;
  readonly queriesPerRequest?: number;
  readonly durationSeconds?: number;
  readonly seed?: number;
}

const TRANSPARENT_API_SERVER = {
  instances: 1,
  concurrency: 10_000,
  serviceTimeMs: 0.001,
  serviceTimeDistribution: "constant",
  queueLimit: 0,
};

/** One client calling one API server, which queries one database. */
export function buildClientApiDatabaseDesign(options: ClientApiDatabaseDesignOptions = {}): SimulationDesign {
  return {
    schemaVersion: 1,
    run: { durationSeconds: options.durationSeconds ?? 10, seed: options.seed ?? 1 },
    nodes: [
      { id: "client", type: "client", config: { timeoutMs: 600_000, ...options.client } },
      { id: "api", type: "api-server", config: options.apiServer ?? TRANSPARENT_API_SERVER },
      { id: "database", type: "database", config: options.database ?? {} },
    ],
    edges: [
      { id: "client-to-api", from: { node: "client", port: "out" }, to: { node: "api", port: "in" } },
      {
        id: "api-to-database",
        from: { node: "api", port: "database" },
        to: { node: "database", port: "in" },
        config: { queriesPerRequest: options.queriesPerRequest ?? 1 },
      },
    ],
  };
}
