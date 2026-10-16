import type { BoardConnection, BoardGraph, BoardNode } from "../../src/types.ts";

export function node(id: string, type: string, label = id): BoardNode {
  return { id, type, label };
}

export function connection(source: string, sourcePort: string, target: string, targetPort: string): BoardConnection {
  return { source, sourcePort, target, targetPort };
}

/** Client, load balancer, two API servers and a database, with nothing connected yet. */
export const NODES: readonly BoardNode[] = [
  node("client", "client", "Client"),
  node("lb", "load-balancer", "Load balancer"),
  node("api", "api-server", "API server"),
  node("api-2", "api-server", "API server 2"),
  node("db", "database", "Database"),
];

export function board(...connections: BoardConnection[]): BoardGraph {
  return { nodes: NODES, connections };
}
