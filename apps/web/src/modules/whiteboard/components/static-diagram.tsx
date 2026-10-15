import type { ProjectDocument } from "@rectangles/schema";
import { cn } from "@/lib/utils";
import { completeConfig } from "../lib/component-catalog";
import { GRID_SIZE, NODE_HEIGHT, NODE_WIDTH } from "../lib/component-visuals";
import {
  CAPTION_GAP,
  CAPTION_HEIGHT,
  CAPTION_WIDTH,
  describeDiagram,
  diagramBounds,
  diagramEdges,
  diagramPorts,
  IN_PORT_HEIGHT,
  IN_PORT_WIDTH,
  OUT_PORT_DIAMETER,
} from "../lib/diagram-geometry";
import { ComponentCaption, ComponentTile } from "./component-tile";
import { ArrowMarker } from "./edge-markers";

const ARROW_ID = "static-diagram-arrow";
const DOTS_ID = "static-diagram-dots";

/**
 * A design drawn read-only, looking as it does on the board. It is one SVG rendered on
 * the server: positions come from the document, so nothing is laid out, measured or
 * hydrated in the browser. The viewBox scales the whole drawing, text included, to the
 * width it is given.
 */
export function StaticDiagram({ document, className }: { document: ProjectDocument; className?: string }) {
  const bounds = diagramBounds(document);
  const edges = diagramEdges(document);
  const ports = diagramPorts(document);

  return (
    <svg
      role="img"
      aria-label={describeDiagram(document)}
      viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
      className={cn("static-diagram block h-auto w-full rounded-xl border bg-background", className)}
    >
      <defs>
        <ArrowMarker id={ARROW_ID} colour="var(--xy-edge-stroke)" />
        <pattern id={DOTS_ID} width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
          <circle cx={GRID_SIZE / 2} cy={GRID_SIZE / 2} r={0.5} className="fill-(--xy-background-pattern-color)" />
        </pattern>
      </defs>
      <rect x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} fill={`url(#${DOTS_ID})`} />

      {edges.map((edge) => (
        <path
          key={edge.id}
          d={edge.path}
          fill="none"
          strokeWidth={1.5}
          markerEnd={`url(#${ARROW_ID})`}
          className="stroke-(--xy-edge-stroke)"
        />
      ))}

      {/* Positioned HTML inside foreignObject renders in the wrong place in Safari, so tile and caption each get their own. */}
      {document.nodes.map((node) => (
        <g key={node.id}>
          <foreignObject x={node.position.x} y={node.position.y} width={NODE_WIDTH} height={NODE_HEIGHT}>
            <ComponentTile componentType={node.type} />
          </foreignObject>
          <foreignObject
            x={node.position.x + NODE_WIDTH / 2 - CAPTION_WIDTH / 2}
            y={node.position.y + NODE_HEIGHT + CAPTION_GAP}
            width={CAPTION_WIDTH}
            height={CAPTION_HEIGHT}
          >
            <ComponentCaption
              componentType={node.type}
              label={node.label}
              config={completeConfig(node.type, node.config)}
              className="text-foreground"
            />
          </foreignObject>
        </g>
      ))}

      {ports.map((port) =>
        port.direction === "out" ? (
          <circle
            key={port.key}
            cx={port.x}
            cy={port.y}
            r={OUT_PORT_DIAMETER / 2}
            className="fill-(--xy-handle-background-color)"
          />
        ) : (
          <rect
            key={port.key}
            x={port.x - IN_PORT_WIDTH / 2}
            y={port.y - IN_PORT_HEIGHT / 2}
            width={IN_PORT_WIDTH}
            height={IN_PORT_HEIGHT}
            rx={2}
            className="fill-(--xy-handle-background-color)"
          />
        ),
      )}
    </svg>
  );
}
