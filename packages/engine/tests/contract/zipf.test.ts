import { describe, expect, it } from "vitest";
import { createZipfSampler } from "../../src/contract/zipf.ts";
import { Prng } from "../../src/kernel/prng.ts";

const DRAWS = 200_000;

function frequencies(keyCount: number, skew: number): number[] {
  const draw = createZipfSampler(keyCount, skew);
  const random = new Prng(7, "zipf");
  const counts = new Array<number>(keyCount).fill(0);
  for (let index = 0; index < DRAWS; index++) {
    const key = draw(random);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts.map((count) => count / DRAWS);
}

function expectedZipf(keyCount: number, skew: number): number[] {
  const weights = Array.from({ length: keyCount }, (_, index) => 1 / (index + 1) ** skew);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => weight / total);
}

describe("createZipfSampler", () => {
  it.each([0.5, 1, 1.5, 3])("draws key k with probability ∝ 1 / (k + 1)^%s", (skew) => {
    const observed = frequencies(20, skew);
    expectedZipf(20, skew).forEach((expected, key) => {
      expect(Math.abs((observed[key] ?? 0) - expected), `key ${key}`).toBeLessThan(0.005);
    });
  });

  it("draws uniformly at skew 0", () => {
    for (const frequency of frequencies(10, 0)) {
      expect(frequency).toBeCloseTo(0.1, 2);
    }
  });

  it("stays within range for millions of keys", () => {
    const draw = createZipfSampler(10_000_000, 1);
    const random = new Prng(1);
    for (let index = 0; index < 10_000; index++) {
      const key = draw(random);
      expect(Number.isInteger(key) && key >= 0 && key < 10_000_000).toBe(true);
    }
  });

  it("always draws key 0 when there is only one key", () => {
    expect(createZipfSampler(1, 1)(new Prng(1))).toBe(0);
  });
});
