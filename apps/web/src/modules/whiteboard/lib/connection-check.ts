import type { Connection } from "@xyflow/react";
import type { ComponentNode, ConnectionEdge } from "../types";
import { findComponentDefinition } from "./component-catalog";

function hasPort(node: ComponentNode, portId: string | null, direction: "in" | "out"): boolean {
  const ports = findComponentDefinition(node.data.componentType)?.ports ?? [];
  return ports.some((port) => port.id === portId && port.direction === direction);
}

/**
 * Whether a connection is well formed: it joins an out port to an in port of a
 * different node, and the same connection does not already exist.
 *
 * Whether it makes sense (matching protocols, how many connections a port may have) is
 * the job of the rules package and is not checked here.
 */
export function isWellFormedConnection(
  connection: Connection | ConnectionEdge,
  nodes: readonly ComponentNode[],
  edges: readonly ConnectionEdge[],
): boolean {
  const { source, target } = connection;
  const sourceHandle = connection.sourceHandle ?? null;
  const targetHandle = connection.targetHandle ?? null;
  if (source === target) {
    return false;
  }
  const sourceNode = nodes.find((node) => node.id === source);
  const targetNode = nodes.find((node) => node.id === target);
  if (sourceNode === undefined || targetNode === undefined) {
    return false;
  }
  if (!hasPort(sourceNode, sourceHandle, "out") || !hasPort(targetNode, targetHandle, "in")) {
    return false;
  }
  return !edges.some(
    (edge) =>
      edge.source === source &&
      edge.target === target &&
      (edge.sourceHandle ?? null) === sourceHandle &&
      (edge.targetHandle ?? null) === targetHandle,
  );
}
