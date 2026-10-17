import type { XYPosition } from "@xyflow/react";

/** How long components take to glide into their tidied places. */
export const GLIDE_MS = 300;

/** Fast at first, settling gently: things arriving rather than being dragged. */
export function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

/** Each component `progress` of the way, from 0 to 1, from where it was to where it goes. */
export function positionsPartWay(
  from: ReadonlyMap<string, XYPosition>,
  to: ReadonlyMap<string, XYPosition>,
  progress: number,
): Map<string, XYPosition> {
  const positions = new Map<string, XYPosition>();
  for (const [id, target] of to) {
    const start = from.get(id) ?? target;
    positions.set(id, {
      x: start.x + (target.x - start.x) * progress,
      y: start.y + (target.y - start.y) * progress,
    });
  }
  return positions;
}
