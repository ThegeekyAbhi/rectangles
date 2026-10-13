import { ViewportPortal } from "@xyflow/react";
import type { GuideLine } from "../lib/alignment-geometry";

/** Draws alignment guides in board coordinates, so they pan and zoom with the nodes. */
export function AlignmentGuides({ guides }: { guides: readonly GuideLine[] }) {
  return (
    <ViewportPortal>
      {guides.map((guide) => (
        <div
          key={guide.orientation}
          className="pointer-events-none absolute bg-ring"
          style={
            guide.orientation === "vertical"
              ? { left: guide.position, top: guide.start, width: 1, height: guide.end - guide.start }
              : { top: guide.position, left: guide.start, height: 1, width: guide.end - guide.start }
          }
        />
      ))}
    </ViewportPortal>
  );
}
