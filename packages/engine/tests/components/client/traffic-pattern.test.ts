import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import type { TrafficPattern } from "../../../src/components/client/traffic-pattern.ts";
import { rateAtSeconds, requestsBy, trafficSegmentAt } from "../../../src/components/client/traffic-pattern.ts";

const base = {
  ratePerSecond: 100,
  targetRatePerSecond: 500,
  changeAtSeconds: 10,
  changeDurationSeconds: 20,
} as const;

function ratesAt(pattern: TrafficPattern, seconds: readonly number[]): number[] {
  return seconds.map((second) => rateAtSeconds(pattern, second));
}

describe("rateAtSeconds", () => {
  it("holds a steady rate", () => {
    expect(ratesAt({ ...base, pattern: "steady" }, [0, 10, 500])).toEqual([100, 100, 100]);
  });

  it("jumps to the target at the change time for a step", () => {
    expect(ratesAt({ ...base, pattern: "step" }, [0, 9.999, 10, 500])).toEqual([100, 100, 500, 500]);
  });

  it("raises the rate only for the duration of a spike", () => {
    expect(ratesAt({ ...base, pattern: "spike" }, [9.999, 10, 29.999, 30])).toEqual([
      100, 500, 500, 100,
    ]);
  });

  it("moves linearly to the target over a ramp, then holds it", () => {
    expect(ratesAt({ ...base, pattern: "ramp" }, [0, 10, 15, 20, 30, 100])).toEqual([
      100, 100, 200, 300, 500, 500,
    ]);
  });

  it("ramps downwards when the target is lower", () => {
    const pattern = { ...base, pattern: "ramp", ratePerSecond: 500, targetRatePerSecond: 100 } as const;
    expect(ratesAt(pattern, [10, 20, 30])).toEqual([500, 300, 100]);
  });

  it("treats a zero-length ramp as a step", () => {
    const pattern = { ...base, pattern: "ramp", changeDurationSeconds: 0 } as const;
    expect(ratesAt(pattern, [9.999, 10])).toEqual([100, 500]);
  });
});

describe("trafficSegmentAt", () => {
  const forever = Number.POSITIVE_INFINITY;

  it("gives steady traffic one stretch", () => {
    expect(trafficSegmentAt({ ...base, pattern: "steady" }, 0)).toEqual({ endSeconds: forever, peakRatePerSecond: 100 });
  });

  it("splits a spike into before, during and after", () => {
    const spike = { ...base, pattern: "spike" } as const;
    expect([0, 10, 29.9, 30].map((second) => trafficSegmentAt(spike, second))).toEqual([
      { endSeconds: 10, peakRatePerSecond: 100 },
      { endSeconds: 30, peakRatePerSecond: 500 },
      { endSeconds: 30, peakRatePerSecond: 500 },
      { endSeconds: forever, peakRatePerSecond: 100 },
    ]);
  });

  it("splits a ramp into short pieces, each peaking at its higher end", () => {
    // 100 → 500 over 20 s from 10 s: pieces of 1.25 s, rising 25 requests/s each.
    expect(trafficSegmentAt({ ...base, pattern: "ramp" }, 10)).toEqual({ endSeconds: 11.25, peakRatePerSecond: 125 });
    expect(trafficSegmentAt({ ...base, pattern: "ramp" }, 29.9)).toEqual({ endSeconds: 30, peakRatePerSecond: 500 });
    const falling = { ...base, pattern: "ramp", ratePerSecond: 900 } as const;
    expect(trafficSegmentAt(falling, 10).peakRatePerSecond).toBe(900);
  });

  it("moves on to the next piece exactly at a piece's end", () => {
    const ramp = { ...base, pattern: "ramp", changeAtSeconds: 0.1, changeDurationSeconds: 0.7 } as const;
    let seconds = 0.1;
    for (let piece = 0; piece < 16; piece++) {
      const segment = trafficSegmentAt(ramp, seconds);
      expect(segment.endSeconds).toBeGreaterThan(seconds);
      seconds = segment.endSeconds;
    }
    expect(seconds).toBe(ramp.changeAtSeconds + ramp.changeDurationSeconds);
  });

  test.prop([
    fc.record({
      pattern: fc.constantFrom("steady", "ramp", "spike", "step"),
      ratePerSecond: fc.integer({ min: 0, max: 2000 }),
      targetRatePerSecond: fc.integer({ min: 0, max: 2000 }),
      changeAtSeconds: fc.integer({ min: 0, max: 30 }),
      changeDurationSeconds: fc.integer({ min: 0, max: 30 }),
    }),
    fc.double({ min: 0, max: 100, noNaN: true }),
  ])("never lets the rate exceed the stretch's peak", (pattern, seconds) => {
    const segment = trafficSegmentAt(pattern, seconds);
    expect(segment.endSeconds).toBeGreaterThan(seconds);
    expect(rateAtSeconds(pattern, seconds)).toBeLessThanOrEqual(segment.peakRatePerSecond + 1e-9);
  });
});

describe("requestsBy", () => {
  const STEPS = 20_000;

  /** The rate's integral by the midpoint rule: slow, but obviously right. */
  function integrateRate(pattern: TrafficPattern, seconds: number): number {
    const steps = STEPS;
    const width = seconds / steps;
    let total = 0;
    for (let step = 0; step < steps; step++) {
      total += rateAtSeconds(pattern, (step + 0.5) * width) * width;
    }
    return total;
  }

  test.prop([
    fc.record({
      pattern: fc.constantFrom("steady", "ramp", "spike", "step"),
      ratePerSecond: fc.integer({ min: 0, max: 2000 }),
      targetRatePerSecond: fc.integer({ min: 0, max: 2000 }),
      changeAtSeconds: fc.integer({ min: 0, max: 30 }),
      changeDurationSeconds: fc.integer({ min: 0, max: 30 }),
    }),
    fc.integer({ min: 1, max: 60 }),
  ])("matches the integral of the rate", (pattern, seconds) => {
    // The midpoint rule smears each of a pattern's (at most two) jumps in rate across one
    // step, so it can be off by up to one step's worth of the largest jump per jump.
    const tolerance = 2 * (seconds / STEPS) * Math.max(pattern.ratePerSecond, pattern.targetRatePerSecond) + 1e-6;
    expect(Math.abs(requestsBy(pattern, seconds) - integrateRate(pattern, seconds))).toBeLessThanOrEqual(tolerance);
  });

  it("starts at zero and never decreases", () => {
    const pattern = { ...base, pattern: "spike" } as const;
    const totals = [0, 5, 10, 15, 30, 31, 60].map((second) => requestsBy(pattern, second));
    expect(totals[0]).toBe(0);
    expect(totals).toEqual([...totals].sort((left, right) => left - right));
  });

  it("treats a ramp of no length as a step", () => {
    const ramp = { ...base, pattern: "ramp", changeDurationSeconds: 0 } as const;
    expect(requestsBy(ramp, 20)).toBe(requestsBy({ ...ramp, pattern: "step" }, 20));
  });
});

describe("trafficSegmentAt with a ramp too short to split", () => {
  it("always ends a segment after the time asked about, so arrivals move on", () => {
    // Found by the request-conservation property: a ramp lasting 2.5e-323 s made every
    // piece zero long, and the client asked for the same segment forever.
    const pattern = {
      pattern: "ramp" as const,
      ratePerSecond: 1993,
      targetRatePerSecond: 1286,
      changeAtSeconds: 7.4e-323,
      changeDurationSeconds: 2.5e-323,
    };
    for (const seconds of [7.4e-323, 8e-323, 9e-323]) {
      expect(trafficSegmentAt(pattern, seconds).endSeconds).toBeGreaterThan(seconds);
    }
  });
});
