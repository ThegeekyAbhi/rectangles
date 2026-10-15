/**
 * While a run is live its newest window is still filling, so a count taken from it
 * would read low. These helpers pick the figure that is fair to show.
 */

/** The timing a reading needs: window length, run length so far, and whether it is live. */
export interface RunTiming {
  readonly windowSeconds: number;
  readonly simulatedSeconds: number;
  /** `true` while the run is in progress, so the newest window is still filling. */
  readonly isLive: boolean;
}

/** The newest complete window of a live run, or `undefined` before one exists. */
export function latestCompleteWindow<Window>(windows: readonly Window[]): Window | undefined {
  return windows.at(-2);
}

/** The windows that are complete: all of them once the run has ended. */
export function completeWindows<Window>(windows: readonly Window[], isLive: boolean): readonly Window[] {
  return isLive ? windows.slice(0, -1) : windows;
}

/**
 * Events per second. Live: over the latest complete window, or `null` before one
 * exists. Ended: over the whole run.
 */
export function currentRate(
  reading: RunTiming & { readonly windows: readonly number[]; readonly total: number },
): number | null {
  const { windows, total, windowSeconds, simulatedSeconds, isLive } = reading;
  if (!isLive) {
    return simulatedSeconds > 0 ? total / simulatedSeconds : null;
  }
  const latest = latestCompleteWindow(windows);
  return latest === undefined ? null : latest / windowSeconds;
}

/**
 * A level, such as utilisation or queue depth. Live: its average over the newest
 * window. Ended: the highest window average of the run, so a component that was
 * overloaded for part of the run still shows it.
 */
export function currentLevel(windows: readonly number[], isLive: boolean): number | null {
  if (windows.length === 0) {
    return null;
  }
  return isLive ? (windows.at(-1) ?? null) : Math.max(...windows);
}
