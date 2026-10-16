import type { PortDirection } from "@rectangles/engine";
import { registry } from "@rectangles/engine";
import { connectionRules } from "../registry.ts";
import type { BoardConnection, BoardGraph, ConnectionContext, ConnectionEnd, ConnectionRule, ConnectionVerdict } from "../types.ts";

function resolveEnd(graph: BoardGraph, nodeId: string, portId: string, direction: PortDirection): ConnectionEnd | null {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  const definition = node === undefined ? undefined : registry.get(node.type)?.definition;
  const port = definition?.ports.find((candidate) => candidate.id === portId && candidate.direction === direction);
  return node === undefined || definition === undefined || port === undefined ? null : { node, definition, port };
}

/**
 * Judges a proposed connection on the board. A `block` from any rule wins over a `warn`;
 * within a severity, the first rule in registry order explains the verdict.
 */
export function checkConnection(
  proposal: BoardConnection,
  graph: BoardGraph,
  rules: readonly ConnectionRule[] = connectionRules,
): ConnectionVerdict {
  const source = resolveEnd(graph, proposal.source, proposal.sourcePort, "out");
  const target = resolveEnd(graph, proposal.target, proposal.targetPort, "in");
  if (source === null || target === null) {
    return { kind: "invalid" };
  }
  const context: ConnectionContext = { proposal, source, target, graph };
  let warning: ConnectionRule | undefined;
  for (const rule of rules) {
    // A block decides at once, so later rules, such as the loop search, never run.
    if ((rule.severity === "block" || warning === undefined) && rule.applies(context)) {
      if (rule.severity === "block") {
        return { kind: "block", ruleId: rule.id, ...rule.copy(context) };
      }
      warning = rule;
    }
  }
  return warning === undefined ? { kind: "ok" } : { kind: "warn", ruleId: warning.id, ...warning.copy(context) };
}

/**
 * Judges the connection at `index` in the graph, as if it were being made now: the graph
 * is taken without it, so it is not mistaken for its own duplicate or loop.
 */
export function checkExistingConnection(graph: BoardGraph, index: number): ConnectionVerdict {
  const connection = graph.connections[index];
  if (connection === undefined) {
    return { kind: "invalid" };
  }
  const others = graph.connections.filter((_, position) => position !== index);
  return checkConnection(connection, { nodes: graph.nodes, connections: others });
}

/** Whether the canvas may make the connection: allowed outright or with a warning. */
export function isConnectable(verdict: ConnectionVerdict): boolean {
  return verdict.kind === "ok" || verdict.kind === "warn";
}
