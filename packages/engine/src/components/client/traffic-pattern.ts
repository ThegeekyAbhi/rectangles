import type { ClientConfig } from "./definition.ts";

/** The fields of the client config that shape its traffic. */
export type TrafficPattern = Pick<
  ClientConfig,
  "pattern" | "ratePerSecond" | "targetRatePerSecond" | "changeAtSeconds" | "changeDurationSeconds"
>;

/** The request rate the pattern asks for at a moment in the run. */
export function rateAtSeconds(pattern: TrafficPattern, seconds: number): number {
  const { ratePerSecond, targetRatePerSecond, changeAtSeconds, changeDurationSeconds } = pattern;
  const secondsIntoChange = seconds - changeAtSeconds;
  switch (pattern.pattern) {
    case "steady":
      return ratePerSecond;
    case "step":
      return secondsIntoChange < 0 ? ratePerSecond : targetRatePerSecond;
    case "spike":
      return secondsIntoChange >= 0 && secondsIntoChange < changeDurationSeconds
        ? targetRatePerSecond
        : ratePerSecond;
    case "ramp": {
      if (secondsIntoChange < 0) {
        return ratePerSecond;
      }
      if (secondsIntoChange >= changeDurationSeconds) {
        return targetRatePerSecond;
      }
      const progress = secondsIntoChange / changeDurationSeconds;
      return ratePerSecond + (targetRatePerSecond - ratePerSecond) * progress;
    }
  }
}

/** The highest rate the pattern ever asks for. */
export function peakRatePerSecond(pattern: TrafficPattern): number {
  return pattern.pattern === "steady"
    ? pattern.ratePerSecond
    : Math.max(pattern.ratePerSecond, pattern.targetRatePerSecond);
}
