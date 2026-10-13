import { describe, expect, it } from "vitest";
import type { ConfigFields } from "../../src/contract/config-field.ts";
import { validateConfig } from "../../src/kernel/config-validation.ts";

const fields = {
  instances: { kind: "integer", label: "Instances", description: "", default: 2, min: 1, max: 10 },
  serviceTimeMs: {
    kind: "number",
    label: "Service time",
    description: "",
    unit: "ms",
    default: 20,
    min: 0.5,
    max: 1000,
  },
  mode: {
    kind: "choice",
    label: "Mode",
    description: "",
    options: ["fast", "slow"],
    default: "fast",
  },
} as const satisfies ConfigFields;

function issuesFor(rawConfig: unknown): string[] {
  const validation = validateConfig(fields, rawConfig);
  return validation.ok ? [] : validation.issues.map((issue) => `${issue.field}: ${issue.message}`);
}

describe("validateConfig", () => {
  it("fills in defaults for missing fields", () => {
    expect(validateConfig(fields, { instances: 4 })).toEqual({
      ok: true,
      config: { instances: 4, serviceTimeMs: 20, mode: "fast" },
    });
  });

  it("accepts a missing config", () => {
    expect(validateConfig(fields, undefined)).toMatchObject({ ok: true });
  });

  it("accepts values at the limits", () => {
    expect(issuesFor({ instances: 1, serviceTimeMs: 1000 })).toEqual([]);
  });

  it("rejects values outside the range and names the unit", () => {
    expect(issuesFor({ instances: 11, serviceTimeMs: 0.1 })).toEqual([
      "instances: Must be between 1 and 10.",
      "serviceTimeMs: Must be between 0.5 and 1000 ms.",
    ]);
  });

  it("rejects fractions for integer fields", () => {
    expect(issuesFor({ instances: 2.5 })).toEqual(["instances: Must be a whole number."]);
  });

  it("rejects non-numbers, NaN and infinity", () => {
    expect(issuesFor({ instances: "2" })).toEqual(["instances: Must be a number."]);
    expect(issuesFor({ serviceTimeMs: Number.NaN })).toEqual(["serviceTimeMs: Must be a number."]);
    expect(issuesFor({ serviceTimeMs: Number.POSITIVE_INFINITY })).toEqual([
      "serviceTimeMs: Must be a number.",
    ]);
  });

  it("rejects a choice that is not an option", () => {
    expect(issuesFor({ mode: "medium" })).toEqual(["mode: Must be one of: fast, slow."]);
  });

  it("reports unknown fields instead of dropping them", () => {
    expect(issuesFor({ instnaces: 3 })).toEqual(['instnaces: Unknown field "instnaces".']);
  });

  it("rejects a config that is not an object", () => {
    expect(issuesFor([1, 2])).toEqual([": Config must be an object."]);
    expect(issuesFor(null)).toEqual([": Config must be an object."]);
  });
});
