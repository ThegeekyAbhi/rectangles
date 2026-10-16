"use client";

import { ProhibitIcon } from "@phosphor-icons/react";
import type { BoardGraph } from "@rectangles/rules";
import { Panel, useConnection } from "@xyflow/react";
import { useMemo } from "react";
import { refusalBetweenHandles } from "../lib/connection-check";

/**
 * While a connection is dragged over a port it cannot join, says why, before the
 * pointer is let go.
 */
export function ConnectionHint({ graph }: { graph: BoardGraph }) {
  // Plain fields, which `useConnection` compares shallowly: moving the pointer without
  // changing the handles does not re-render.
  const handles = useConnection((connection) =>
    connection.inProgress && connection.isValid === false && connection.toHandle !== null
      ? {
          fromNodeId: connection.fromHandle.nodeId,
          fromId: connection.fromHandle.id,
          fromType: connection.fromHandle.type,
          toNodeId: connection.toHandle.nodeId,
          toId: connection.toHandle.id,
          toType: connection.toHandle.type,
        }
      : null,
  );

  const refusal = useMemo(
    () =>
      handles === null
        ? null
        : refusalBetweenHandles(
            { nodeId: handles.fromNodeId, id: handles.fromId, type: handles.fromType },
            { nodeId: handles.toNodeId, id: handles.toId, type: handles.toType },
            graph,
          ),
    [handles, graph],
  );

  if (refusal === null) {
    return null;
  }
  return (
    <Panel position="top-center" className="pointer-events-none">
      <p className="flex items-center gap-2 rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-sm">
        <ProhibitIcon weight="duotone" className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        {refusal.title}
      </p>
    </Panel>
  );
}
