import type { ComponentNode, ConnectionEdge } from "../types";
import { GRID_SIZE } from "./component-visuals";
import { portAnchor } from "./port-layout";

/** Distance between neighbouring lanes, and the least room kept between a lane and a node. */
const LANE_SPACING = GRID_SIZE;

/** Every edge leaving one out port. They share a lane, so a fork reads as one line that splits. */
interface LaneGroup {
  readonly key: string;
  readonly edgeIds: string[];
  readonly sourceX: number;
  readonly sourceY: number;
  /** The closest target, which limits how far right the lane may sit. */
  nearestTargetX: number;
  /** Vertical extent of the lane. */
  top: number;
  bottom: number;
  targetYTotal: number;
}

function laneCentre(group: LaneGroup): number {
  return (group.sourceX + group.nearestTargetX) / 2;
}

function clampLane(group: LaneGroup, x: number): number {
  const min = group.sourceX + LANE_SPACING;
  const max = group.nearestTargetX - LANE_SPACING;
  return min > max ? laneCentre(group) : Math.min(Math.max(x, min), max);
}

/** Whether two groups would draw their vertical lines on top of each other. */
function isOverlapping(left: LaneGroup, right: LaneGroup): boolean {
  return (
    Math.abs(laneCentre(left) - laneCentre(right)) < LANE_SPACING &&
    left.top <= right.bottom &&
    right.top <= left.bottom
  );
}

/**
 * Orders the groups that share a gap so their lines cross as little as possible: of
 * two lines heading down, the upper one bends further right, and the reverse heading up.
 */
function laneOrder(group: LaneGroup): number {
  const isHeadingDown = group.targetYTotal / group.edgeIds.length > group.sourceY;
  return isHeadingDown ? -group.sourceY : group.sourceY;
}

function collectGroups(
  nodes: readonly ComponentNode[],
  edges: readonly ConnectionEdge[],
): LaneGroup[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const groups = new Map<string, LaneGroup>();
  for (const edge of edges) {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    if (sourceNode === undefined || targetNode === undefined) {
      continue;
    }
    const source = portAnchor(sourceNode, edge.sourceHandle ?? "");
    const target = portAnchor(targetNode, edge.targetHandle ?? "");
    // An edge running backwards, or with no room for a lane, keeps the default route.
    if (source === undefined || target === undefined || target.x - source.x < LANE_SPACING * 2) {
      continue;
    }
    const key = `${edge.source}:${edge.sourceHandle ?? ""}`;
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, {
        key,
        edgeIds: [edge.id],
        sourceX: source.x,
        sourceY: source.y,
        nearestTargetX: target.x,
        top: Math.min(source.y, target.y),
        bottom: Math.max(source.y, target.y),
        targetYTotal: target.y,
      });
    } else {
      group.edgeIds.push(edge.id);
      group.nearestTargetX = Math.min(group.nearestTargetX, target.x);
      group.top = Math.min(group.top, target.y);
      group.bottom = Math.max(group.bottom, target.y);
      group.targetYTotal += target.y;
    }
  }
  // A group whose edges are all level has no vertical line to keep apart.
  return [...groups.values()].filter((group) => group.bottom > group.top);
}

function computeEdgeLanes(
  nodes: readonly ComponentNode[],
  edges: readonly ConnectionEdge[],
): ReadonlyMap<string, number> {
  const groups = collectGroups(nodes, edges);
  const laneByGroup = new Map<LaneGroup, number>();

  for (const start of groups) {
    if (laneByGroup.has(start)) {
      continue;
    }
    // Gather every group that overlaps this one, directly or through another group.
    const cluster = [start];
    laneByGroup.set(start, laneCentre(start));
    for (const member of cluster) {
      for (const candidate of groups) {
        if (!laneByGroup.has(candidate) && isOverlapping(member, candidate)) {
          laneByGroup.set(candidate, laneCentre(candidate));
          cluster.push(candidate);
        }
      }
    }
    if (cluster.length === 1) {
      continue;
    }
    cluster.sort(
      (left, right) => laneOrder(left) - laneOrder(right) || left.key.localeCompare(right.key),
    );
    const middle = cluster.reduce((sum, group) => sum + laneCentre(group), 0) / cluster.length;
    cluster.forEach((group, index) => {
      const offset = (index - (cluster.length - 1) / 2) * LANE_SPACING;
      laneByGroup.set(group, clampLane(group, middle + offset));
    });
  }

  const lanes = new Map<string, number>();
  for (const [group, lane] of laneByGroup) {
    for (const edgeId of group.edgeIds) {
      lanes.set(edgeId, lane);
    }
  }
  return lanes;
}

let lastNodes: readonly ComponentNode[] | undefined;
let lastEdges: readonly ConnectionEdge[] | undefined;
let lastLanes: ReadonlyMap<string, number> = new Map();

/**
 * Chooses where each edge makes its vertical run, as an x position on the board, so
 * that edges from different ports never draw on top of each other. An edge missing
 * from the result keeps the canvas's default route.
 *
 * Edges leaving the same port share a lane. The result for the latest board is kept,
 * so every edge can ask for its own lane without the work being repeated.
 */
export function assignEdgeLanes(
  nodes: readonly ComponentNode[],
  edges: readonly ConnectionEdge[],
): ReadonlyMap<string, number> {
  if (nodes !== lastNodes || edges !== lastEdges) {
    lastLanes = computeEdgeLanes(nodes, edges);
    lastNodes = nodes;
    lastEdges = edges;
  }
  return lastLanes;
}
