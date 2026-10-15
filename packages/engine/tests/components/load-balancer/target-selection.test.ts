import { describe, expect, it } from "vitest";
import type { SelectionAlgorithm, TargetTable } from "../../../src/components/load-balancer/target-selection.ts";
import {
  createTargetTable,
  NO_TARGET,
  pickTarget,
  recordResponseTime,
} from "../../../src/components/load-balancer/target-selection.ts";

function pickMany(table: TargetTable, algorithm: SelectionAlgorithm, count: number): number[] {
  return Array.from({ length: count }, () => pickTarget(table, algorithm, NO_TARGET));
}

describe("round robin", () => {
  it("takes plain turns when weights are equal", () => {
    expect(pickMany(createTargetTable([1, 1, 1]), "round-robin", 6)).toEqual([0, 1, 2, 0, 1, 2]);
  });

  it("spreads weighted turns out, as NGINX's smooth weighted round robin does", () => {
    // NGINX's documented sequence for weights 5, 1, 1: a a b a c a a.
    expect(pickMany(createTargetTable([5, 1, 1]), "round-robin", 7)).toEqual([0, 0, 1, 0, 2, 0, 0]);
  });

  it("gives each target its weight's share", () => {
    const picks = pickMany(createTargetTable([1, 25, 4]), "round-robin", 300);
    expect([0, 1, 2].map((target) => picks.filter((pick) => pick === target).length)).toEqual([10, 250, 40]);
  });

  it("ignores how busy a target is", () => {
    const table = createTargetTable([1, 1]);
    table.inFlight[0] = 100;
    expect(pickMany(table, "round-robin", 2)).toEqual([0, 1]);
  });
});

describe("least connections", () => {
  it("picks the target with the fewest requests in flight", () => {
    const table = createTargetTable([1, 1, 1]);
    table.inFlight.set([5, 2, 7]);
    expect(pickTarget(table, "least-connections", NO_TARGET)).toBe(1);
  });

  it("measures requests in flight against weight", () => {
    const table = createTargetTable([1, 10]);
    table.inFlight.set([2, 10]);
    // 2 ÷ 1 = 2 against 10 ÷ 10 = 1.
    expect(pickTarget(table, "least-connections", NO_TARGET)).toBe(1);
  });

  it("shares ties by weight", () => {
    const picks = pickMany(createTargetTable([3, 1]), "least-connections", 8);
    expect(picks.filter((pick) => pick === 0)).toHaveLength(6);
  });
});

describe("least time", () => {
  it("prefers the target answering faster", () => {
    const table = createTargetTable([1, 1]);
    table.peakEwmaMicros.set([100_000, 20_000]);
    table.inFlight.set([1, 3]);
    // 100 ms × 2 against 20 ms × 4.
    expect(pickTarget(table, "least-time", NO_TARGET)).toBe(1);
  });

  it("sends one request at a time to a target not yet measured", () => {
    const table = createTargetTable([1, 1]);
    table.peakEwmaMicros.set([0, 20_000]);
    expect(pickTarget(table, "least-time", NO_TARGET)).toBe(0);
    table.inFlight[0] = 1;
    expect(pickTarget(table, "least-time", NO_TARGET)).toBe(1);
  });
});

describe("ejection and exclusion", () => {
  it.each(["round-robin", "least-connections", "least-time"] as const)("%s skips an ejected target", (algorithm) => {
    const table = createTargetTable([1, 1, 1]);
    table.isEjected[1] = 1;
    expect(pickMany(table, algorithm, 6)).not.toContain(1);
  });

  it("uses every target when all are ejected", () => {
    const table = createTargetTable([1, 1]);
    table.isEjected.set([1, 1]);
    expect(pickMany(table, "round-robin", 2)).toEqual([0, 1]);
  });

  it("never picks the excluded target, and finds nothing when it is the only one", () => {
    const table = createTargetTable([1, 1]);
    expect(pickTarget(table, "round-robin", 0)).toBe(1);
    expect(pickTarget(table, "round-robin", 0)).toBe(1);
    expect(pickTarget(createTargetTable([1]), "round-robin", 0)).toBe(NO_TARGET);
  });
});

describe("recordResponseTime", () => {
  it("takes a slower response at once and decays towards faster ones", () => {
    const table = createTargetTable([1]);
    recordResponseTime(table, 0, 100, 0, 1_000);
    expect(table.peakEwmaMicros[0]).toBe(100);
    recordResponseTime(table, 0, 20, 1_000, 1_000);
    // After one decay period, e⁻¹ of the old value remains.
    expect(table.peakEwmaMicros[0]).toBeCloseTo(100 * Math.exp(-1) + 20 * (1 - Math.exp(-1)), 9);
  });
});
