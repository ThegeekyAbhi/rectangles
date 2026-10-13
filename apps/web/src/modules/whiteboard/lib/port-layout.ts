import type { XYPosition } from "@xyflow/react";
import type { ComponentNode } from "../types";
import { findComponentDefinition } from "./component-catalog";
import { NODE_HEIGHT, NODE_WIDTH } from "./component-visuals";

/**
 * How far down a node's side a port sits, from 0 (top) to 1 (bottom), when `count`
 * ports share that side. Ports are spread evenly.
 */
export function portOffset(index: number, count: number): number {
  return (index + 1) / (count + 1);
}

/**
 * Where a port sits on the board: in ports on the node's left side, out ports on its
 * right. `undefined` if the node's component has no such port.
 */
export function portAnchor(node: ComponentNode, portId: string): XYPosition | undefined {
  const ports = findComponentDefinition(node.data.componentType)?.ports ?? [];
  const port = ports.find((candidate) => candidate.id === portId);
  if (port === undefined) {
    return undefined;
  }
  const sameSide = ports.filter((candidate) => candidate.direction === port.direction);
  return {
    x: node.position.x + (port.direction === "out" ? NODE_WIDTH : 0),
    y: node.position.y + NODE_HEIGHT * portOffset(sameSide.indexOf(port), sameSide.length),
  };
}
