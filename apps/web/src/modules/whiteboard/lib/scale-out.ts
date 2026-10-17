import { nextNumberedName, uniqueName } from "@/lib/unique-name";
import type { BoardElements, ComponentNode, ConnectionEdge } from "../types";
import { completeConnectionConfig, defaultConfigFor, findComponentDefinition } from "./component-catalog";
import { EDGE_TYPE } from "./document-conversion";

/** Room between columns and rows of components, matching how boards are usually laid out. */
const COLUMN_GAP = 224;
const ROW_GAP = 176;

function connection(
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
  sourceType: string,
): ConnectionEdge {
  return {
    id,
    type: EDGE_TYPE,
    source,
    sourceHandle,
    target,
    targetHandle,
    data: { config: completeConnectionConfig(sourceType, sourceHandle, {}) },
  };
}

/**
 * The board after scaling one component out: a copy of it with the same settings and the
 * same outgoing connections, fed by the component its definition names (a load balancer).
 * If one already feeds the original, the copy joins it; otherwise one is put in the
 * original's place, between its callers and the two copies. Returns `null` for a component
 * that does not scale by copying. The result replaces the board in one step, so it undoes
 * in one step.
 */
export function planScaleOut(board: BoardElements, nodeId: string, newId: () => string): BoardElements | null {
  const original = board.nodes.find((node) => node.id === nodeId);
  const scaleOut = original === undefined ? undefined : findComponentDefinition(original.data.componentType)?.scaleOut;
  const routerDefinition = scaleOut === undefined ? undefined : findComponentDefinition(scaleOut.via);
  const routerInPort = routerDefinition?.ports.find((port) => port.direction === "in")?.id;
  if (original === undefined || scaleOut === undefined || routerDefinition === undefined || routerInPort === undefined) {
    return null;
  }

  const typeOf = (id: string) => board.nodes.find((node) => node.id === id)?.data.componentType ?? "";
  const incoming = board.edges.filter((edge) => edge.target === nodeId);
  const originalInPort = incoming[0]?.targetHandle ?? "in";
  const existingRouter = incoming.find((edge) => typeOf(edge.source) === scaleOut.via)?.source;
  const labels = board.nodes.map((node) => node.data.label);
  const unselected = board.nodes.map((node) => (node.selected === true ? { ...node, selected: false } : node));
  const unselectedEdges = board.edges.map((edge) => (edge.selected === true ? { ...edge, selected: false } : edge));

  // Without a router, one takes the original's place and the original moves one column right.
  const shift = existingRouter === undefined ? COLUMN_GAP : 0;
  const routerId = existingRouter ?? newId();
  const siblings = board.nodes.filter((node) =>
    board.edges.some((edge) => edge.source === routerId && edge.target === node.id),
  );
  const lowestY = Math.max(original.position.y, ...siblings.map((node) => node.position.y));

  const copy: ComponentNode = {
    ...original,
    id: newId(),
    position: { x: original.position.x + shift, y: lowestY + ROW_GAP },
    data: { ...original.data, label: nextNumberedName(original.data.label, labels) },
    selected: true,
  };
  const copiedOutgoing = board.edges
    .filter((edge) => edge.source === nodeId)
    .map((edge): ConnectionEdge => ({ ...edge, id: newId(), source: copy.id, selected: false }));
  const routerToCopy = connection(newId(), routerId, scaleOut.port, copy.id, originalInPort, scaleOut.via);

  if (existingRouter !== undefined) {
    return {
      nodes: [...unselected, copy],
      edges: [...unselectedEdges, routerToCopy, ...copiedOutgoing],
    };
  }

  const router: ComponentNode = {
    id: routerId,
    type: "component",
    position: original.position,
    data: {
      componentType: scaleOut.via,
      label: uniqueName(routerDefinition.label, labels),
      config: defaultConfigFor(scaleOut.via),
    },
  };
  const incomingIds = new Set(incoming.map((edge) => edge.id));
  const edges = unselectedEdges.map((edge) =>
    incomingIds.has(edge.id) ? { ...edge, target: routerId, targetHandle: routerInPort } : edge,
  );
  return {
    nodes: [
      ...unselected.map((node) =>
        node.id === nodeId ? { ...node, position: { x: node.position.x + shift, y: node.position.y } } : node,
      ),
      router,
      copy,
    ],
    edges: [
      ...edges,
      connection(newId(), routerId, scaleOut.port, nodeId, originalInPort, scaleOut.via),
      routerToCopy,
      ...copiedOutgoing,
    ],
  };
}
