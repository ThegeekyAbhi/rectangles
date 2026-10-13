import { describe, expect, it } from "vitest";
import { capacityStateOf } from "@/modules/metrics/lib/capacity-state";

describe("capacityStateOf", () => {
  it.each([
    [0, "healthy"],
    [0.79, "healthy"],
    [0.8, "busy"],
    [0.94, "busy"],
    [0.95, "saturated"],
    [1, "saturated"],
  ] as const)("reads utilisation %f as %s", (utilisation, state) => {
    expect(capacityStateOf(utilisation)).toBe(state);
  });
});
