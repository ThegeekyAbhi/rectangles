import type { XYPosition } from "@xyflow/react";
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";
import { findComponentDefinition } from "../component-catalog";
import { GRID_SIZE, NODE_HEIGHT, NODE_WIDTH } from "../component-visuals";
import { CAPTION_GAP, CAPTION_HEIGHT, CAPTION_WIDTH } from "../diagram-geometry";
import { portOffset } from "../port-layout";

/** What laying out needs to know about a component on the board. */
export interface LayoutNode {
  readonly id: string;
  readonly componentType: string;
  readonly position: XYPosition;
  readonly selected?: boolean;
}

export interface LayoutEdge {
  readonly id: string;
  readonly source: string;
  readonly sourceHandle?: string | null;
  readonly target: string;
  readonly targetHandle?: string | null;
}

export interface LayoutScope {
  readonly nodes: readonly LayoutNode[];
  readonly edges: readonly LayoutEdge[];
}

/**
 * Each component is laid out as one box holding its tile and the caption under it, so
 * captions never collide. The tile sits centred at the top of the box.
 */
const BOX_WIDTH = CAPTION_WIDTH;
const BOX_HEIGHT = NODE_HEIGHT + CAPTION_GAP + CAPTION_HEIGHT;
const TILE_INSET_X = (BOX_WIDTH - NODE_WIDTH) / 2;

/**
 * How the layout looks, each choice for a reason:
 * - layered, rightwards: traffic flows left to right, in ports on the left, out on the right.
 * - Brandes–Köpf, balanced: a chain becomes one straight line and a fan-out is centred on its source.
 * - model order: components keep the top-to-bottom order the user gave them.
 * - spacing: room between columns for edge labels such as "4.5K/s", rows one grid step apart.
 * - separate components: unconnected parts are packed beside each other, not interleaved.
 * - a fixed seed: the same board always lays out the same way.
 */
export const LAYOUT_OPTIONS: Readonly<Record<string, string>> = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
  "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  "elk.layered.spacing.nodeNodeBetweenLayers": String(GRID_SIZE * 6),
  "elk.spacing.nodeNode": String(GRID_SIZE * 2),
  "elk.spacing.componentComponent": String(GRID_SIZE * 4),
  "elk.edgeRouting": "SPLINES",
  "elk.separateConnectedComponents": "true",
  "elk.randomSeed": "1",
};

/** Fewer components than this have nothing to arrange, so a smaller selection tidies the board. */
export const MIN_TIDY_COUNT = 2;

/**
 * What a tidy acts on: the selection when two or more components are selected, otherwise
 * the whole board. Only edges between components in scope count.
 */
export function layoutScope(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[]): LayoutScope {
  const selected = nodes.filter((node) => node.selected === true);
  const scoped = selected.length >= MIN_TIDY_COUNT ? selected : nodes;
  const ids = new Set(scoped.map((node) => node.id));
  return { nodes: scoped, edges: edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)) };
}

function portId(nodeId: string, handle: string): string {
  return `${nodeId}::${handle}`;
}

/** Ports where the board draws them: in ports down the tile's left side, out ports down its right. */
function portsOf(node: LayoutNode): NonNullable<ElkNode["ports"]> {
  const ports = findComponentDefinition(node.componentType)?.ports ?? [];
  return (["in", "out"] as const).flatMap((direction) => {
    const sameSide = ports.filter((port) => port.direction === direction);
    return sameSide.map((port, index) => ({
      id: portId(node.id, port.id),
      x: direction === "in" ? 0 : BOX_WIDTH,
      y: portOffset(index, sameSide.length) * NODE_HEIGHT,
      width: 0,
      height: 0,
      layoutOptions: { "elk.port.side": direction === "in" ? "WEST" : "EAST" },
    }));
  });
}

/** The scope as an ELK graph. Children go in the board's top-to-bottom order, which ELK keeps. */
export function toElkGraph(scope: LayoutScope): ElkNode {
  const ordered = [...scope.nodes].sort((left, right) => left.position.y - right.position.y || left.position.x - right.position.x);
  const portIds = new Set(ordered.flatMap((node) => portsOf(node).map((port) => port.id)));
  const endpoint = (nodeId: string, handle: string | null | undefined) => {
    const id = handle === null || handle === undefined ? null : portId(nodeId, handle);
    return id !== null && portIds.has(id) ? id : nodeId;
  };
  return {
    id: "board",
    layoutOptions: LAYOUT_OPTIONS,
    children: ordered.map((node) => ({
      id: node.id,
      width: BOX_WIDTH,
      height: BOX_HEIGHT,
      ports: portsOf(node),
      layoutOptions: { "elk.portConstraints": "FIXED_POS" },
    })),
    edges: scope.edges.map(
      (edge): ElkExtendedEdge => ({
        id: edge.id,
        sources: [endpoint(edge.source, edge.sourceHandle)],
        targets: [endpoint(edge.target, edge.targetHandle)],
      }),
    ),
  };
}

function snap(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

/**
 * Where each tile goes after ELK has laid the scope out: on the board grid, with the
 * group's top-left corner where the scope's top-left corner was, so the board does not jump.
 */
export function positionsFromLayout(layout: ElkNode, scope: LayoutScope): Map<string, XYPosition> {
  const tiles = new Map<string, XYPosition>();
  for (const child of layout.children ?? []) {
    tiles.set(child.id, { x: (child.x ?? 0) + TILE_INSET_X, y: child.y ?? 0 });
  }
  if (tiles.size === 0) {
    return tiles;
  }
  const laidOut = [...tiles.values()];
  const anchorX = snap(Math.min(...scope.nodes.map((node) => node.position.x)));
  const anchorY = snap(Math.min(...scope.nodes.map((node) => node.position.y)));
  const shiftX = anchorX - Math.min(...laidOut.map((position) => position.x));
  const shiftY = anchorY - Math.min(...laidOut.map((position) => position.y));
  const positions = new Map<string, XYPosition>();
  for (const [id, position] of tiles) {
    positions.set(id, { x: snap(position.x + shiftX), y: snap(position.y + shiftY) });
  }
  return positions;
}
