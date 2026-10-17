import type { ConfigFields } from "@rectangles/engine";
import { describe, expect, it } from "vitest";
import { groupFieldsBySection } from "@/modules/inspector/lib/field-sections";

const fields = {
  label: { kind: "number", label: "Plain", description: "", default: 1, min: 0, max: 9 },
  size: { kind: "choice", label: "Size", description: "", section: "Scale up", options: ["a", "b"], default: "a" },
  time: { kind: "number", label: "Time", description: "", section: "Workload", default: 1, min: 0, max: 9 },
  workers: { kind: "number", label: "Workers", description: "", section: "Scale up", default: 1, min: 0, max: 9 },
  extra: {
    kind: "number",
    label: "Extra",
    description: "",
    section: "Workload",
    default: 1,
    min: 0,
    max: 9,
    relevantWhen: { field: "size", isOneOf: ["b"] },
  },
} as const satisfies ConfigFields;

describe("groupFieldsBySection", () => {
  it("puts unsectioned fields first, then each section in the order it first appears", () => {
    const sections = groupFieldsBySection(fields, { size: "a" });
    expect(sections.map((section) => [section.title, section.fields.map(([name]) => name)])).toEqual([
      [null, ["label"]],
      ["Scale up", ["size", "workers"]],
      ["Workload", ["time"]],
    ]);
  });

  it("shows a field only while it applies", () => {
    const workload = groupFieldsBySection(fields, { size: "b" }).find((section) => section.title === "Workload");
    expect(workload?.fields.map(([name]) => name)).toEqual(["time", "extra"]);
  });
});
