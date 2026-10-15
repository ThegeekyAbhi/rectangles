import type { ProjectDocument } from "@rectangles/schema";
import { CURRENT_SCHEMA_VERSION } from "@rectangles/schema";
import type { BoardElements, ComponentNode, ConnectionEdge } from "../types";
import { completeConfig, completeConnectionConfig } from "./component-catalog";

/** Every edge on the board is drawn by the one `connection` edge renderer. */
export const EDGE_TYPE = "connection";

/** Turns a saved document into the nodes and edges the canvas draws. */
export function documentToElements(document: ProjectDocument): BoardElements {
  const typeByNodeId = new Map(document.nodes.map((node) => [node.id, node.type]));
  return {
    nodes: document.nodes.map((node) => ({
      id: node.id,
      type: "component",
      position: { x: node.position.x, y: node.position.y },
      data: {
        componentType: node.type,
        label: node.label,
        config: completeConfig(node.type, node.config),
      },
    })),
    edges: document.edges.map((edge) => ({
      id: edge.id,
      type: EDGE_TYPE,
      source: edge.from.node,
      sourceHandle: edge.from.port,
      target: edge.to.node,
      targetHandle: edge.to.port,
      data: {
        config: completeConnectionConfig(typeByNodeId.get(edge.from.node) ?? "", edge.from.port, edge.config),
      },
    })),
  };
}

/**
 * Turns the canvas's nodes and edges into the document that is saved. Everything that
 * only matters while editing (selection, measured sizes, drag state) is left out.
 */
export function elementsToDocument(
  nodes: readonly ComponentNode[],
  edges: readonly ConnectionEdge[],
): ProjectDocument {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.data.componentType,
      label: node.data.label,
      position: { x: node.position.x, y: node.position.y },
      config: { ...node.data.config },
    })),
    edges: edges.flatMap((edge) =>
      edge.sourceHandle == null || edge.targetHandle == null
        ? []
        : [
            {
              id: edge.id,
              from: { node: edge.source, port: edge.sourceHandle },
              to: { node: edge.target, port: edge.targetHandle },
              config: { ...edge.data?.config },
            },
          ],
    ),
  };
}

/**
 * Whether two sets of board elements would save as the same document. Node data is
 * replaced, never mutated, so comparing it by identity is enough.
 */
export function isSameDocument(left: BoardElements, right: BoardElements): boolean {
  if (left.nodes === right.nodes && left.edges === right.edges) {
    return true;
  }
  return (
    left.nodes.length === right.nodes.length &&
    left.nodes.every((node, index) => {
      const other = right.nodes[index];
      return (
        other !== undefined &&
        node.id === other.id &&
        node.data === other.data &&
        node.position.x === other.position.x &&
        node.position.y === other.position.y
      );
    }) &&
    hasSameConnections(left.edges, right.edges)
  );
}

/**
 * Whether two lists of edges join the same ports with the same settings, in the same
 * order. Settings are replaced, never mutated, so comparing them by identity is enough.
 */
export function hasSameConnections(left: BoardElements["edges"], right: BoardElements["edges"]): boolean {
  return (
    left.length === right.length &&
    left.every((edge, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        edge.id === other.id &&
        edge.source === other.source &&
        edge.target === other.target &&
        edge.sourceHandle === other.sourceHandle &&
        edge.targetHandle === other.targetHandle &&
        edge.data?.config === other.data?.config
      );
    })
  );
}
