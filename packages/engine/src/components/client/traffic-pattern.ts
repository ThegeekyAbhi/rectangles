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

/** Requests the pattern asks for from the start of the run to `seconds`: its rate's integral. */
export function requestsBy(pattern: TrafficPattern, seconds: number): number {
  const { ratePerSecond, targetRatePerSecond, changeAtSeconds, changeDurationSeconds } = pattern;
  const until = Math.max(0, seconds);
  const beforeChange = ratePerSecond * Math.min(until, changeAtSeconds);
  const intoChange = Math.max(0, until - changeAtSeconds);
  switch (pattern.pattern) {
    case "steady":
      return ratePerSecond * until;
    case "step":
      return beforeChange + targetRatePerSecond * intoChange;
    case "spike": {
      const spiking = Math.min(intoChange, changeDurationSeconds);
      return beforeChange + targetRatePerSecond * spiking + ratePerSecond * (intoChange - spiking);
    }
    case "ramp": {
      const ramping = Math.min(intoChange, changeDurationSeconds);
      // A ramp of zero length is a step; otherwise the rate climbs linearly while ramping.
      const rampArea =
        changeDurationSeconds === 0
          ? 0
          : ratePerSecond * ramping + ((targetRatePerSecond - ratePerSecond) * ramping ** 2) / (2 * changeDurationSeconds);
      return beforeChange + rampArea + targetRatePerSecond * (intoChange - ramping);
    }
  }
}

/**
 * Pieces a ramp is split into for drawing arrivals. Each piece's peak is the rate at its
 * higher end, so fewer than 1 in 32 candidates on a ramp are drawn only to be rejected.
 */
const RAMP_PIECES = 16;

/** A stretch of the run over which the pattern's rate never exceeds `peakRatePerSecond`. */
export interface TrafficSegment {
  /** When the stretch ends, in seconds; `Infinity` for the last one. */
  readonly endSeconds: number;
  readonly peakRatePerSecond: number;
}

/**
 * The stretch of the pattern that `seconds` falls in. Steady, step and spike stretches
 * hold one rate, so arrivals in them need no thinning; a ramp is split into short pieces,
 * each peaking at its higher end.
 */
export function trafficSegmentAt(pattern: TrafficPattern, seconds: number): TrafficSegment {
  const { ratePerSecond, targetRatePerSecond, changeAtSeconds, changeDurationSeconds } = pattern;
  const changeEndSeconds = changeAtSeconds + changeDurationSeconds;
  if (pattern.pattern === "steady") {
    return { endSeconds: Number.POSITIVE_INFINITY, peakRatePerSecond: ratePerSecond };
  }
  if (seconds < changeAtSeconds) {
    return { endSeconds: changeAtSeconds, peakRatePerSecond: ratePerSecond };
  }
  switch (pattern.pattern) {
    case "step":
      return { endSeconds: Number.POSITIVE_INFINITY, peakRatePerSecond: targetRatePerSecond };
    case "spike":
      return seconds < changeEndSeconds
        ? { endSeconds: changeEndSeconds, peakRatePerSecond: targetRatePerSecond }
        : { endSeconds: Number.POSITIVE_INFINITY, peakRatePerSecond: ratePerSecond };
    case "ramp": {
      if (seconds >= changeEndSeconds) {
        return { endSeconds: Number.POSITIVE_INFINITY, peakRatePerSecond: targetRatePerSecond };
      }
      // The piece whose end lies after `seconds`, guarding against rounding at a boundary.
      let piece = Math.floor(((seconds - changeAtSeconds) * RAMP_PIECES) / changeDurationSeconds);
      let endSeconds = changeAtSeconds + ((piece + 1) * changeDurationSeconds) / RAMP_PIECES;
      if (endSeconds <= seconds) {
        piece += 1;
        endSeconds = changeAtSeconds + ((piece + 1) * changeDurationSeconds) / RAMP_PIECES;
      }
      if (piece >= RAMP_PIECES - 1) {
        endSeconds = changeEndSeconds;
      }
      const startSeconds = changeAtSeconds + (piece * changeDurationSeconds) / RAMP_PIECES;
      return {
        endSeconds,
        peakRatePerSecond: Math.max(rateAtSeconds(pattern, startSeconds), rateAtSeconds(pattern, endSeconds)),
      };
    }
  }
}
