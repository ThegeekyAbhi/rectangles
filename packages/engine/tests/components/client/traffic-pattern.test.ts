import { describe, expect, it } from "vitest";
import type { TrafficPattern } from "../../../src/components/client/traffic-pattern.ts";
import { peakRatePerSecond, rateAtSeconds } from "../../../src/components/client/traffic-pattern.ts";

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

describe("peakRatePerSecond", () => {
  it("ignores the target rate of a steady pattern", () => {
    expect(peakRatePerSecond({ ...base, pattern: "steady" })).toBe(100);
  });

  it("is the higher of the two rates for changing patterns", () => {
    expect(peakRatePerSecond({ ...base, pattern: "spike" })).toBe(500);
    expect(peakRatePerSecond({ ...base, pattern: "ramp", ratePerSecond: 900 })).toBe(900);
  });
});
