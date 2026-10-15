export const ARROW_MARKER_ID = "connection-arrow";
export const SELECTED_ARROW_MARKER_ID = "connection-arrow-selected";

export function ArrowMarker({ id, colour }: { id: string; colour: string }) {
  return (
    <marker
      id={id}
      viewBox="-10 -10 20 20"
      markerWidth={20}
      markerHeight={20}
      markerUnits="strokeWidth"
      orient="auto-start-reverse"
      refX={0}
      refY={0}
    >
      <polyline
        points="-5,-4 0,0 -5,4 -5,-4"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1}
        style={{ stroke: colour, fill: colour }}
      />
    </marker>
  );
}

/**
 * The arrowheads edges point with. The canvas's built-in arrowheads come in one colour
 * for the whole board, so a selected edge would keep a faded arrow; these follow the
 * edge's own colour. Must be rendered inside the canvas, where the colours are defined.
 */
export function EdgeMarkers() {
  return (
    <svg className="pointer-events-none absolute size-0" aria-hidden>
      <defs>
        <ArrowMarker id={ARROW_MARKER_ID} colour="var(--xy-edge-stroke)" />
        <ArrowMarker id={SELECTED_ARROW_MARKER_ID} colour="var(--xy-edge-stroke-selected)" />
      </defs>
    </svg>
  );
}
