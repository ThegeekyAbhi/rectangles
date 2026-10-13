/**
 * How loaded a component is.
 *
 * - `healthy`: room to spare.
 * - `busy`: most capacity is in use; a burst would queue.
 * - `saturated`: effectively full, the threshold the bottleneck explanation uses.
 */
export type CapacityState = "healthy" | "busy" | "saturated";

export const BUSY_UTILISATION = 0.8;
export const SATURATED_UTILISATION = 0.95;

export function capacityStateOf(utilisation: number): CapacityState {
  if (utilisation >= SATURATED_UTILISATION) {
    return "saturated";
  }
  return utilisation >= BUSY_UTILISATION ? "busy" : "healthy";
}
