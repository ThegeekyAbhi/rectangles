import type { NodeChange } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { useCallback, useRef, useState } from "react";
import type { Box, GuideLine } from "../lib/alignment-geometry";
import { alignBox } from "../lib/alignment-geometry";
import { useWhiteboardStoreApi } from "../store/whiteboard-store-context";
import type { ComponentNode } from "../types";

/** How close, in screen pixels, an edge or centre must be to snap. */
const SNAP_DISTANCE = 5;

function boxOf(node: ComponentNode, position = node.position): Box | null {
  const { width, height } = node.measured ?? {};
  return width === undefined || height === undefined
    ? null
    : { x: position.x, y: position.y, width, height };
}

/**
 * While a single node is dragged, snaps it to the edges and centres of the other nodes
 * and reports the guide lines to draw. Dragging several nodes at once is left alone.
 */
export function useAlignmentGuides() {
  const store = useWhiteboardStoreApi();
  const { getZoom } = useReactFlow();
  const [guides, setGuides] = useState<readonly GuideLine[]>([]);
  const hasGuidesRef = useRef(false);

  const showGuides = useCallback((next: readonly GuideLine[]) => {
    // Most drag frames have no guides before or after; skip those re-renders.
    if (next.length > 0 || hasGuidesRef.current) {
      hasGuidesRef.current = next.length > 0;
      setGuides(next);
    }
  }, []);

  const alignChanges = useCallback(
    (changes: NodeChange<ComponentNode>[]): NodeChange<ComponentNode>[] => {
      const moves = changes.filter((change) => change.type === "position");
      const [move] = moves;
      if (moves.length !== 1 || move?.dragging !== true || move.position === undefined) {
        if (moves.length > 0) {
          showGuides([]);
        }
        return changes;
      }
      const { nodes } = store.getState();
      const movingNode = nodes.find((node) => node.id === move.id);
      const moving = movingNode && boxOf(movingNode, move.position);
      if (moving == null) {
        return changes;
      }
      const others = nodes.flatMap((node) => {
        const box = node.id === move.id ? null : boxOf(node);
        return box === null ? [] : [box];
      });
      const alignment = alignBox(moving, others, SNAP_DISTANCE / getZoom());
      showGuides(alignment.guides);
      return changes.map((change) =>
        change === move ? { ...move, position: { x: alignment.x, y: alignment.y } } : change,
      );
    },
    [getZoom, showGuides, store],
  );

  return { guides, alignChanges };
}
