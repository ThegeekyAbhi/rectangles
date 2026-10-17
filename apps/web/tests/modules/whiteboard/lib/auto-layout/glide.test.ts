import { describe, expect, it } from "vitest";
import { easeOutCubic, positionsPartWay } from "@/modules/whiteboard/lib/auto-layout/glide";

describe("glide", () => {
  it("eases from start to end, quick at first", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });

  it("moves each component part of the way to its target", () => {
    const from = new Map([["a", { x: 0, y: 0 }]]);
    const to = new Map([["a", { x: 100, y: 40 }]]);
    expect(positionsPartWay(from, to, 0.25).get("a")).toEqual({ x: 25, y: 10 });
    expect(positionsPartWay(from, to, 1).get("a")).toEqual({ x: 100, y: 40 });
  });
});
