import type { BoardElements, ComponentNode, ConnectionEdge } from "../types";

/** How far each paste is shifted from the one before, so copies never hide each other. */
export const PASTE_OFFSET = 32;

/**
 * What a copy keeps: the selected nodes and only the edges that run between them. An
 * edge to a node that was not copied would have nothing to attach to after pasting.
 */
export function pickCopiedElements(
  nodes: readonly ComponentNode[],
  edges: readonly ConnectionEdge[],
): BoardElements {
  const copiedNodes = nodes.filter((node) => node.selected === true);
  const copiedIds = new Set(copiedNodes.map((node) => node.id));
  return {
    nodes: copiedNodes,
    edges: edges.filter((edge) => copiedIds.has(edge.source) && copiedIds.has(edge.target)),
  };
}

/**
 * Makes fresh, selected copies of copied elements, shifted by one offset per paste and
 * with the edges between them rewired to the new nodes.
 */
export function placePastedElements(
  copied: BoardElements,
  pasteNumber: number,
  createId: () => string,
): BoardElements {
  const offset = PASTE_OFFSET * pasteNumber;
  const newIdByOldId = new Map<string, string>();
  const nodes = copied.nodes.map((node): ComponentNode => {
    const id = createId();
    newIdByOldId.set(node.id, id);
    return {
      id,
      type: "component",
      position: { x: node.position.x + offset, y: node.position.y + offset },
      data: node.data,
      selected: true,
    };
  });
  const edges = copied.edges.flatMap((edge): ConnectionEdge[] => {
    const source = newIdByOldId.get(edge.source);
    const target = newIdByOldId.get(edge.target);
    return source === undefined || target === undefined
      ? []
      : [{ ...edge, id: createId(), source, target, selected: false }];
  });
  return { nodes, edges };
}
