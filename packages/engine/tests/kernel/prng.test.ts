import { describe, expect, it } from "vitest";
import { Prng } from "../../src/kernel/prng.ts";

function take(prng: Prng, count: number): number[] {
  return Array.from({ length: count }, () => prng.nextUint32());
}

describe("Prng", () => {
  it("repeats the same sequence for the same seed and stream", () => {
    expect(take(new Prng(42, "client"), 100)).toEqual(take(new Prng(42, "client"), 100));
  });

  it("keeps its sequence stable across releases", () => {
    // Pinned output: changing the generator silently would change every saved result.
    expect(take(new Prng(1, "client"), 4)).toMatchInlineSnapshot(`
      [
        1235514152,
        1029523805,
        1019744289,
        3023004921,
      ]
    `);
  });

  it("gives different sequences for different seeds", () => {
    expect(take(new Prng(1), 8)).not.toEqual(take(new Prng(2), 8));
  });

  it("uses the high bits of seeds above 32 bits", () => {
    expect(take(new Prng(1), 8)).not.toEqual(take(new Prng(1 + 2 ** 32), 8));
  });

  it("gives different sequences for different streams of one seed", () => {
    expect(take(new Prng(7, "client"), 8)).not.toEqual(take(new Prng(7, "api"), 8));
  });

  it("produces floats in [0, 1) with mean one half", () => {
    const prng = new Prng(3);
    let sum = 0;
    for (let draw = 0; draw < 200_000; draw++) {
      const value = prng.nextFloat();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      sum += value;
    }
    expect(sum / 200_000).toBeCloseTo(0.5, 2);
  });

  it("produces exponential values with the requested mean and variance", () => {
    const prng = new Prng(5);
    const mean = 20;
    let sum = 0;
    let sumOfSquares = 0;
    const draws = 400_000;
    for (let draw = 0; draw < draws; draw++) {
      const value = prng.nextExponential(mean);
      sum += value;
      sumOfSquares += value * value;
    }
    const observedMean = sum / draws;
    const observedVariance = sumOfSquares / draws - observedMean ** 2;
    expect(observedMean / mean).toBeCloseTo(1, 2);
    // An exponential distribution's variance is its mean squared.
    expect(observedVariance / mean ** 2).toBeCloseTo(1, 1);
  });
});
