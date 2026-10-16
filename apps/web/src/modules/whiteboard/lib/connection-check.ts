import type { BoardConnection, BoardGraph, BoardNode, ConnectionVerdict } from "@rectangles/rules";
import { checkConnection, checkExistingConnection } from "@rectangles/rules";
import type { Connection, Handle } from "@xyflow/react";
import type { ComponentNode, ConnectionEdge } from "../types";

/** A verdict the user is told about: a warning or a refusal, with its explanation. */
export type RuleAdvice = Extract<ConnectionVerdict, { kind: "warn" | "block" }>;

type ConnectionLike = Pick<Connection, "source" | "target"> & {
  readonly sourceHandle?: string | null;
  readonly targetHandle?: string | null;
};

/** A missing handle becomes an empty port id, which no component declares, so the rules call it invalid. */
function toBoardConnection(connection: ConnectionLike): BoardConnection {
  return {
    source: connection.source,
    sourcePort: connection.sourceHandle ?? "",
    target: connection.target,
    targetPort: connection.targetHandle ?? "",
  };
}

function toBoardNode(node: ComponentNode): BoardNode {
  return { id: node.id, type: node.data.componentType, label: node.data.label };
}

/** The board as the rules see it: component types, names and connections, no positions. */
export function toBoardGraph(nodes: readonly ComponentNode[], edges: readonly ConnectionEdge[]): BoardGraph {
  return { nodes: nodes.map(toBoardNode), connections: edges.map(toBoardConnection) };
}

/**
 * What the rules read from each component (id, type, name) and connection (id and both
 * ends), as flat lists of strings. A selector wrapped in `useShallow` therefore returns
 * the same lists while components are dragged or connections selected.
 */
export function nodeRuleInputs(nodes: readonly ComponentNode[]): string[] {
  return nodes.flatMap((node) => [node.id, node.data.componentType, node.data.label]);
}

export function edgeRuleInputs(edges: readonly ConnectionEdge[]): string[] {
  return edges.flatMap((edge) => [edge.id, edge.source, edge.sourceHandle ?? "", edge.target, edge.targetHandle ?? ""]);
}

/** The rules' view of a board, rebuilt from `nodeRuleInputs` and `edgeRuleInputs`. */
export interface BoardRuleView {
  readonly graph: BoardGraph;
  /** Edge id of each of `graph.connections`, in the same order. */
  readonly edgeIds: readonly string[];
}

export function boardRuleView(nodeInputs: readonly string[], edgeInputs: readonly string[]): BoardRuleView {
  const nodes: BoardNode[] = [];
  for (let index = 0; index + 2 < nodeInputs.length; index += 3) {
    nodes.push({ id: nodeInputs[index] ?? "", type: nodeInputs[index + 1] ?? "", label: nodeInputs[index + 2] ?? "" });
  }
  const connections: BoardConnection[] = [];
  const edgeIds: string[] = [];
  for (let index = 0; index + 4 < edgeInputs.length; index += 5) {
    edgeIds.push(edgeInputs[index] ?? "");
    connections.push({
      source: edgeInputs[index + 1] ?? "",
      sourcePort: edgeInputs[index + 2] ?? "",
      target: edgeInputs[index + 3] ?? "",
      targetPort: edgeInputs[index + 4] ?? "",
    });
  }
  return { graph: { nodes, connections }, edgeIds };
}

/** Judges a connection the user is making, by the rules in `@rectangles/rules`. */
export function checkBoardConnection(connection: ConnectionLike, graph: BoardGraph): ConnectionVerdict {
  return checkConnection(toBoardConnection(connection), graph);
}

/**
 * Why a drag between two handles is refused, or `null` if it is not. React Flow lets a
 * drag begin at an in port and end at an out port, so either end may be the source.
 */
export function refusalBetweenHandles(
  from: Pick<Handle, "nodeId" | "id" | "type">,
  to: Pick<Handle, "nodeId" | "id" | "type">,
  graph: BoardGraph,
): RuleAdvice | null {
  const [source, target] = from.type === "source" ? [from, to] : [to, from];
  const verdict = checkBoardConnection(
    { source: source.nodeId, sourceHandle: source.id ?? null, target: target.nodeId, targetHandle: target.id ?? null },
    graph,
  );
  return verdict.kind === "block" ? verdict : null;
}

/** Each connection already on the board that the rules warn about, by edge id. */
export function warnedEdges({ graph, edgeIds }: BoardRuleView): ReadonlyMap<string, RuleAdvice> {
  const warnings = new Map<string, RuleAdvice>();
  edgeIds.forEach((edgeId, index) => {
    const verdict = checkExistingConnection(graph, index);
    if (verdict.kind === "warn") {
      warnings.set(edgeId, verdict);
    }
  });
  return warnings;
}
