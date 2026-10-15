import type { EdgeProps } from "@xyflow/react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from "@xyflow/react";
import { memo } from "react";
import type { ConnectionEdge as ConnectionEdgeType } from "../types";
import { useCanvasSlots } from "./canvas-slots";
import { ARROW_MARKER_ID, SELECTED_ARROW_MARKER_ID } from "./edge-markers";

/**
 * Draws any connection: a curve from an out port to an in port, ending in an arrowhead
 * at the receiving end.
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
  const { EdgeLabel } = useCanvasSlots();
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
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
