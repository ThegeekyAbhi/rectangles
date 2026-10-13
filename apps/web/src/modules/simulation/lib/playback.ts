/**
 * How long a run takes to watch, in real seconds, whatever length of time it
 * simulates. A ten-minute test and a thirty-second one both play in this long.
 */
export const PLAYBACK_SECONDS = 10;

/** How often the worker reports progress, in real milliseconds. */
export const TICK_MS = 100;

/**
 * The longest stretch of real time one tick may account for. A browser slows timers in
 * a background tab; without this the run would leap ahead when the tab is shown again.
 */
const MAX_TICK_ELAPSED_MS = TICK_MS * 2.5;

/**
 * Simulated microseconds to advance after `elapsedMs` of real time, so that a run of
 * `durationSeconds` plays back in `PLAYBACK_SECONDS`.
 */
export function simulatedMicrosFor(durationSeconds: number, elapsedMs: number): number {
  const countedMs = Math.min(Math.max(elapsedMs, 0), MAX_TICK_ELAPSED_MS);
  return Math.round((countedMs * 1_000 * durationSeconds) / PLAYBACK_SECONDS);
}
