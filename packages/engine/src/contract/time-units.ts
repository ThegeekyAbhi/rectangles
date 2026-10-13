/**
 * Simulated time, in whole microseconds.
 *
 * Every time and duration inside the engine is an integer number of microseconds, so
 * event ordering is exact. Names carrying this unit end in `Micros`.
 */
export type Micros = number;

export const MICROS_PER_MILLISECOND = 1_000;
export const MICROS_PER_SECOND = 1_000_000;

export function millisecondsToMicros(milliseconds: number): Micros {
  return Math.round(milliseconds * MICROS_PER_MILLISECOND);
}

export function secondsToMicros(seconds: number): Micros {
  return Math.round(seconds * MICROS_PER_SECOND);
}

export function microsToMilliseconds(micros: Micros): number {
  return micros / MICROS_PER_MILLISECOND;
}

export function microsToSeconds(micros: Micros): number {
  return micros / MICROS_PER_SECOND;
}
