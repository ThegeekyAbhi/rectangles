import type { DocumentNode, ProjectDocument } from "@rectangles/schema";
import type { XYPosition } from "@xyflow/system";
import { getBezierPath, Position } from "@xyflow/system";
import { findComponentDefinition } from "./component-catalog";
import { GRID_SIZE, NODE_HEIGHT, NODE_WIDTH } from "./component-visuals";
import { portAnchor, portOffset } from "./port-layout";

/** The caption under a tile: `w-44`, `mt-2`, two 20px label lines and one 16px summary line. */
export const CAPTION_WIDTH = 176;
export const CAPTION_GAP = 8;
export const CAPTION_HEIGHT = 56;

/** Port markers, sized as on the board: out ports are 10px dots, in ports 4×16px bars. */
export const OUT_PORT_DIAMETER = 10;
export const IN_PORT_WIDTH = 4;
export const IN_PORT_HEIGHT = 16;

const PADDING = GRID_SIZE * 2;

export interface DiagramBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DiagramPort {
  readonly key: string;
  readonly direction: "in" | "out";
  readonly x: number;
  readonly y: number;
}

export interface DiagramEdge {
  readonly id: string;
  readonly path: string;
}

/** The area a diagram covers: every tile and the caption under it, plus a margin. */
export function diagramBounds(document: ProjectDocument): DiagramBounds {
  if (document.nodes.length === 0) {
    return { x: 0, y: 0, width: PADDING * 2, height: PADDING * 2 };
  }
  const captionOverhang = (CAPTION_WIDTH - NODE_WIDTH) / 2;
  const left = Math.min(...document.nodes.map((node) => node.position.x - captionOverhang));
  const top = Math.min(...document.nodes.map((node) => node.position.y));
  const right = Math.max(...document.nodes.map((node) => node.position.x + NODE_WIDTH + captionOverhang));
  const bottom = Math.max(
    ...document.nodes.map((node) => node.position.y + NODE_HEIGHT + CAPTION_GAP + CAPTION_HEIGHT),
  );
  return {
    x: left - PADDING,
    y: top - PADDING,
    width: right - left + PADDING * 2,
    height: bottom - top + PADDING * 2,
  };
}

/** Where an edge meets a node: its declared port, else the middle of that side. */
function anchorFor(node: DocumentNode, portId: string, direction: "in" | "out"): XYPosition {
  return (
    portAnchor({ componentType: node.type, position: node.position }, portId) ?? {
      x: node.position.x + (direction === "out" ? NODE_WIDTH : 0),
      y: node.position.y + NODE_HEIGHT / 2,
    }
  );
}

function hasPort(node: DocumentNode, portId: string): boolean {
  return portAnchor({ componentType: node.type, position: node.position }, portId) !== undefined;
}

/** Edges whose two nodes are both in the diagram, with those nodes. */
function joinedEdges(document: ProjectDocument) {
  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));
  return document.edges.flatMap((edge) => {
    const source = nodeById.get(edge.from.node);
    const target = nodeById.get(edge.to.node);
    return source === undefined || target === undefined ? [] : [{ edge, source, target }];
  });
}

/**
 * Each edge as an SVG path, curved exactly as the board curves it. Like React Flow, an
 * edge leaves from the outer edge of the out port's dot and arrives at the outer edge
 * of the in port's bar. An edge to a node that is not in the diagram is left out.
 */
export function diagramEdges(document: ProjectDocument): DiagramEdge[] {
  return joinedEdges(document).map(({ edge, source, target }) => {
    const from = anchorFor(source, edge.from.port, "out");
    const to = anchorFor(target, edge.to.port, "in");
    const [path] = getBezierPath({
      sourceX: from.x + OUT_PORT_DIAMETER / 2,
      sourceY: from.y,
      sourcePosition: Position.Right,
      targetX: to.x - IN_PORT_WIDTH / 2,
      targetY: to.y,
      targetPosition: Position.Left,
    });
    return { id: edge.id, path };
  });
}

/**
 * The port markers to draw: every declared port, as on the board, plus the middle of a
 * side where an edge meets a port the component does not declare (a type not simulated
 * yet, or a port it has not gained yet).
 */
export function diagramPorts(document: ProjectDocument): DiagramPort[] {
  const ports = new Map<string, DiagramPort>();
  for (const node of document.nodes) {
    const declared = findComponentDefinition(node.type)?.ports ?? [];
    for (const direction of ["in", "out"] as const) {
      const sameSide = declared.filter((port) => port.direction === direction);
      sameSide.forEach((port, index) => {
        ports.set(`${node.id}:${port.id}`, {
          key: `${node.id}:${port.id}`,
          direction,
          x: node.position.x + (direction === "out" ? NODE_WIDTH : 0),
          y: node.position.y + NODE_HEIGHT * portOffset(index, sameSide.length),
        });
      });
    }
  }
  for (const { edge, source, target } of joinedEdges(document)) {
    for (const [node, portId, direction] of [
      [source, edge.from.port, "out"],
      [target, edge.to.port, "in"],
    ] as const) {
      const key = `${node.id}:${portId}`;
      if (!ports.has(key)) {
        ports.set(key, { key, direction, ...anchorFor(node, portId, direction) });
      }
    }
  }
  return [...ports.values()];
}

/**
 * What stops a diagram from opening as a board that runs: components the engine does not
 * simulate yet, ports a component does not have, and edges to missing nodes. Empty when
 * the diagram can be simulated as drawn.
 */
export function diagramProblems(document: ProjectDocument): string[] {
  const missingTypes = [...new Set(document.nodes.map((node) => node.type))].filter(
    (type) => findComponentDefinition(type) === undefined,
  );
  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));
  const edgeProblems = document.edges
    .flatMap((edge) => [edge.from, edge.to])
    .flatMap((end) => {
      const node = nodeById.get(end.node);
      if (node === undefined) {
        return [`An edge refers to "${end.node}", which is not in the diagram.`];
      }
      const definition = findComponentDefinition(node.type);
      return definition === undefined || hasPort(node, end.port)
        ? []
        : [`${definition.label} has no "${end.port}" port yet (used by ${node.label}).`];
    });
  return [
    ...missingTypes.map((type) => `"${type}" is not simulated yet.`),
    ...new Set(edgeProblems),
  ];
}

/** A sentence a screen reader reads in place of the picture: who sends to whom. */
export function describeDiagram(document: ProjectDocument): string {
  const labelOf = new Map(document.nodes.map((node) => [node.id, node.label]));
  const sentences = document.nodes.flatMap((node) => {
    const targets = document.edges
      .filter((edge) => edge.from.node === node.id)
      .map((edge) => labelOf.get(edge.to.node) ?? edge.to.node);
    return targets.length === 0 ? [] : [`${node.label} sends to ${targets.join(", ")}.`];
  });
  return ["Architecture diagram.", ...sentences].join(" ");
}
