import { WarningIcon } from "@phosphor-icons/react";
import type { EdgeProps } from "@xyflow/react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from "@xyflow/react";
import { memo } from "react";
import { summariseConnection } from "../lib/component-catalog";
import { useConnectionAdviceStore } from "../store/connection-advice-store";
import { useWhiteboardStore } from "../store/whiteboard-store-context";
import type { ConnectionEdge as ConnectionEdgeType } from "../types";
import { useCanvasSlots } from "./canvas-slots";
import { ARROW_MARKER_ID, SELECTED_ARROW_MARKER_ID } from "./edge-markers";
import { useEdgeWarning } from "./edge-warnings";

/** Dashes mark a connection that works but that real systems rarely make. */
const WARNED_EDGE_STYLE = { strokeDasharray: "6 4" };

/**
 * Draws any connection: a curve from an out port to an in port, ending in an arrowhead
 * at the receiving end. One the rules warn about is dashed, with a button that explains why.
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
  const warning = useEdgeWarning(id);
  const showAdvice = useConnectionAdviceStore((state) => state.show);
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
      <BaseEdge
        id={id}
        path={path}
        markerEnd={`url(#${markerId})`}
        style={warning === undefined ? undefined : WARNED_EDGE_STYLE}
      />
      {(EdgeLabel !== undefined || settings !== null || warning !== undefined) && (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute flex items-center gap-1"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {warning !== undefined && (
              <button
                type="button"
                title={warning.title}
                aria-label={`Why this connection is unusual: ${warning.title}`}
                className="nodrag nopan pointer-events-auto grid size-5 place-items-center rounded-full border bg-card text-muted-foreground hover:text-foreground"
                onClick={() => {
                  showAdvice(warning);
                }}
              >
                <WarningIcon weight="bold" className="size-3" aria-hidden />
              </button>
            )}
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
