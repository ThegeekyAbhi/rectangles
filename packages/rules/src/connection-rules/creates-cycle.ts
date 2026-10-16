import type { BoardConnection, ConnectionRule } from "../types.ts";

/** Whether `from` can already reach `to` by following connections. */
function canReach(connections: readonly BoardConnection[], from: string, to: string): boolean {
  const targetsBySource = new Map<string, string[]>();
  for (const { source, target } of connections) {
    const targets = targetsBySource.get(source);
    if (targets === undefined) {
      targetsBySource.set(source, [target]);
    } else {
      targets.push(target);
    }
  }
  const visited = new Set<string>([from]);
  const pending = [from];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    if (node === to) {
      return true;
    }
    for (const target of targetsBySource.get(node) ?? []) {
      if (!visited.has(target)) {
        visited.add(target);
        pending.push(target);
      }
    }
  }
  return false;
}

export const createsCycle: ConnectionRule = {
  id: "creates-cycle",
  severity: "block",
  applies: ({ proposal, graph }) => canReach(graph.connections, proposal.target, proposal.source),
  copy: ({ source, target }) => ({
    title: "This would create a loop",
    body: `Requests from ${target.node.label} already reach ${source.node.label}, so each request would travel round forever.`,
    fix: "Send requests one way only. When work has to come back, real systems use a separate path, such as a queue.",
  }),
};
