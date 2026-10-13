import type { EdgeProps } from "@xyflow/react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from "@xyflow/react";
import { memo } from "react";
import { assignEdgeLanes } from "../lib/edge-lanes";
import { useWhiteboardStore } from "../store/whiteboard-store-context";
import type { ConnectionEdge as ConnectionEdgeType } from "../types";
import { useCanvasSlots } from "./canvas-slots";
import { ARROW_MARKER_ID, SELECTED_ARROW_MARKER_ID } from "./edge-markers";

const CORNER_RADIUS = 8;

/**
 * Draws any connection: a right-angled line from an out port to an in port, ending in
 * an arrowhead at the receiving end. Its vertical run sits in the edge's own lane.
 */
export const ConnectionEdge = memo(function ConnectionEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  selected,
}: EdgeProps<ConnectionEdgeType>) {
  // Subscribing to this edge's lane alone keeps other edges still while a node is dragged.
  const lane = useWhiteboardStore((state) => assignEdgeLanes(state.nodes, state.edges).get(id));
  const { EdgeLabel } = useCanvasSlots();
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: CORNER_RADIUS,
    centerX: lane,
  });
  const markerId = selected ? SELECTED_ARROW_MARKER_ID : ARROW_MARKER_ID;

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={`url(#${markerId})`} />
      {EdgeLabel !== undefined && (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            <EdgeLabel edgeId={id} />
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
