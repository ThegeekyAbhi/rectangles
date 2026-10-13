import { describe, expect, it } from "vitest";
import {
  formatMetricValue,
  formatNumber,
  formatPercentage,
  formatPerSecond,
} from "@/modules/metrics/lib/format-metric";

describe("formatNumber", () => {
  it("keeps large numbers whole and small ones to three significant digits", () => {
    expect(formatNumber(59_933.4)).toBe("59,933");
    expect(formatNumber(82.558)).toBe("82.6");
    expect(formatNumber(0.19934)).toBe("0.199");
    expect(formatNumber(7)).toBe("7");
  });
});

describe("formatMetricValue", () => {
  it("reads a ratio as a percentage", () => {
    expect(formatMetricValue(0.874, "ratio")).toBe("87.4%");
  });

  it("puts the unit after other values", () => {
    expect(formatMetricValue(124.286, "ms")).toBe("124 ms");
  });

  it("shows a dash when there is no value", () => {
    expect(formatMetricValue(null, "ms")).toBe("—");
    expect(formatPerSecond(null, "requests")).toBe("—");
  });
});

describe("formatPerSecond", () => {
  it("formats a rate with its unit", () => {
    expect(formatPerSecond(1501.4, "requests")).toBe("1,501 requests/s");
  });
});

describe("formatPercentage", () => {
  it("keeps one decimal place at most", () => {
    expect(formatPercentage(0.24014)).toBe("24%");
    expect(formatPercentage(0.5749)).toBe("57.5%");
  });
});
