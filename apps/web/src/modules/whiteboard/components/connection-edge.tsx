import type { EdgeProps } from "@xyflow/react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from "@xyflow/react";
import { memo } from "react";
import { summariseConnection } from "../lib/component-catalog";
import { useWhiteboardStore } from "../store/whiteboard-store-context";
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
  source,
  sourceHandleId,
  data,
}: EdgeProps<ConnectionEdgeType>) {
  const { EdgeLabel } = useCanvasSlots();
  const sourceType = useWhiteboardStore(
    (state) => state.nodes.find((node) => node.id === source)?.data.componentType,
  );
  const settings =
    sourceType === undefined || data === undefined
      ? null
      : summariseConnection(sourceType, sourceHandleId ?? "", data.config);
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
      {(EdgeLabel !== undefined || settings !== null) && (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute flex items-center gap-1"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {settings !== null && (
              <span
                title="Settings of this connection that differ from their defaults"
                className="rounded-sm bg-background px-1 text-[11px] leading-4 text-foreground tabular-nums"
              >
                {settings}
              </span>
            )}
            {EdgeLabel !== undefined && <EdgeLabel edgeId={id} />}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
