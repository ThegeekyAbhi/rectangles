import type { BoardElements } from "@/modules/whiteboard";

/**
 * Whether two boards would simulate the same: the same components with the same
 * settings, joined the same way. Moving or renaming a component changes nothing.
 * Settings are replaced, never mutated, so comparing them by identity is enough.
 */
export function isSameDesign(left: BoardElements, right: BoardElements): boolean {
  if (left.nodes.length !== right.nodes.length || left.edges.length !== right.edges.length) {
    return false;
  }
  const hasSameNodes = left.nodes.every((node, index) => {
    const other = right.nodes[index];
    return (
      other !== undefined &&
      node.id === other.id &&
      node.data.componentType === other.data.componentType &&
      node.data.config === other.data.config
    );
  });
  return (
    hasSameNodes &&
    left.edges.every((edge, index) => {
      const other = right.edges[index];
      return (
        other !== undefined &&
        edge.id === other.id &&
        edge.source === other.source &&
        edge.target === other.target &&
        edge.sourceHandle === other.sourceHandle &&
        edge.targetHandle === other.targetHandle
      );
    })
  );
}
