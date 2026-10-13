import type { RunResult } from "@rectangles/engine";

const seconds = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

/** A length of simulated time, such as `12.4 s`. */
export function formatSimulatedSeconds(value: number): string {
  return `${seconds.format(value)} s`;
}

/** How a run ended, in a few words. */
export function describeRunEnd(result: RunResult): string {
  const reached = formatSimulatedSeconds(result.simulatedSeconds);
  switch (result.stopReason) {
    case "completed":
      return `Finished · ${reached}`;
    case "event-limit":
      return `Stopped at ${reached}: event limit reached`;
    case "time-limit":
      return `Stopped at ${reached}: time limit reached`;
    case null:
      return `Stopped at ${reached}`;
  }
}

/** A test length for a menu, such as `30 seconds` or `5 minutes`. */
export function describeDuration(durationSeconds: number): string {
  if (durationSeconds < 60) {
    return `${durationSeconds} seconds`;
  }
  const minutes = durationSeconds / 60;
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}
