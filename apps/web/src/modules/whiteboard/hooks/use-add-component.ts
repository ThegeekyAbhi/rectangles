import type { XYPosition } from "@xyflow/react";
import { useReactFlow, useStoreApi } from "@xyflow/react";
import { useCallback } from "react";
import { GRID_SIZE, NODE_HEIGHT, NODE_WIDTH } from "../lib/component-visuals";
import { useWhiteboardStoreApi } from "../store/whiteboard-store-context";

function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

/**
 * Adds components to the board at a point on screen, or in the middle of the visible
 * canvas when no point is given (for keyboard and command-palette use).
 */
export function useAddComponent() {
  const store = useWhiteboardStoreApi();
  const flowStore = useStoreApi();
  const { screenToFlowPosition } = useReactFlow();

  return useCallback(
    (componentType: string, screenPoint?: XYPosition): string | null => {
      const bounds = flowStore.getState().domNode?.getBoundingClientRect();
      const point =
        screenPoint ??
        (bounds && { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });
      if (point === undefined) {
        return null;
      }
      const centre = screenToFlowPosition(point);
      const position = {
        x: snapToGrid(centre.x - NODE_WIDTH / 2),
        y: snapToGrid(centre.y - NODE_HEIGHT / 2),
      };
      // Step down and right until the spot is free, so repeated adds never stack.
      const { nodes, addNode } = store.getState();
      while (nodes.some((node) => node.position.x === position.x && node.position.y === position.y)) {
        position.x += GRID_SIZE * 2;
        position.y += GRID_SIZE * 2;
      }
      return addNode(componentType, position);
    },
    [flowStore, screenToFlowPosition, store],
  );
}
