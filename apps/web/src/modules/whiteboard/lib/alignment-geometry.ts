export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface GuideLine {
  readonly orientation: "vertical" | "horizontal";
  /** The x of a vertical line, or the y of a horizontal one. */
  readonly position: number;
  /** Where the line starts and ends along its length. */
  readonly start: number;
  readonly end: number;
}

export interface Alignment {
  /** The moving box's top-left corner after snapping. */
  readonly x: number;
  readonly y: number;
  readonly guides: readonly GuideLine[];
}

interface AxisMatch {
  readonly delta: number;
  readonly position: number;
  readonly other: Box;
}

/** The start, centre and end of a box along one axis. */
function anchorsOf(start: number, size: number): number[] {
  return [start, start + size / 2, start + size];
}

function closestMatch(
  moving: Box,
  others: readonly Box[],
  axis: "x" | "y",
  threshold: number,
): AxisMatch | null {
  const size = axis === "x" ? "width" : "height";
  let best: AxisMatch | null = null;
  for (const other of others) {
    for (const otherAnchor of anchorsOf(other[axis], other[size])) {
      for (const movingAnchor of anchorsOf(moving[axis], moving[size])) {
        const delta = otherAnchor - movingAnchor;
        if (Math.abs(delta) <= threshold && (best === null || Math.abs(delta) < Math.abs(best.delta))) {
          best = { delta, position: otherAnchor, other };
        }
      }
    }
  }
  return best;
}

/**
 * Snaps a moving box to the nearest edge or centre line of another box, on each axis
 * independently, when one lies within `threshold`. Returns the snapped position and
 * the guide lines to draw, each spanning the two boxes it aligns.
 */
export function alignBox(moving: Box, others: readonly Box[], threshold: number): Alignment {
  const horizontalMatch = closestMatch(moving, others, "x", threshold);
  const verticalMatch = closestMatch(moving, others, "y", threshold);
  const x = moving.x + (horizontalMatch?.delta ?? 0);
  const y = moving.y + (verticalMatch?.delta ?? 0);
  const guides: GuideLine[] = [];

  if (horizontalMatch !== null) {
    const { other, position } = horizontalMatch;
    guides.push({
      orientation: "vertical",
      position,
      start: Math.min(y, other.y),
      end: Math.max(y + moving.height, other.y + other.height),
    });
  }
  if (verticalMatch !== null) {
    const { other, position } = verticalMatch;
    guides.push({
      orientation: "horizontal",
      position,
      start: Math.min(x, other.x),
      end: Math.max(x + moving.width, other.x + other.width),
    });
  }
  return { x, y, guides };
}
