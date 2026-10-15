import type { BoardElements } from "@/modules/whiteboard";
import { hasSameConnections } from "@/modules/whiteboard";

/**
 * Whether two boards would simulate the same: the same components with the same
 * settings, joined the same way. Moving or renaming a component changes nothing.
 * Settings are replaced, never mutated, so comparing them by identity is enough.
 */
export function isSameDesign(left: BoardElements, right: BoardElements): boolean {
  return (
    left.nodes.length === right.nodes.length &&
    left.nodes.every((node, index) => {
      const other = right.nodes[index];
      return (
        other !== undefined &&
        node.id === other.id &&
        node.data.componentType === other.data.componentType &&
        node.data.config === other.data.config
      );
    }) &&
    hasSameConnections(left.edges, right.edges)
  );
}
