import type { ComponentDefinition } from "@rectangles/engine";
import { describe, expect, it } from "vitest";
import { listComponentDefinitions } from "@/modules/whiteboard/lib/component-catalog";
import { categoryOf, groupByCategory } from "@/modules/whiteboard/lib/component-categories";

describe("categoryOf", () => {
  it("knows the built-in components and falls back to other", () => {
    expect(categoryOf("client")).toBe("traffic");
    expect(categoryOf("api-server")).toBe("compute");
    expect(categoryOf("teapot")).toBe("other");
  });
});

describe("groupByCategory", () => {
  it("puts traffic before compute and leaves out empty sections", () => {
    const categories = groupByCategory(listComponentDefinitions());
    expect(categories.map((category) => category.name)).toEqual(["Traffic", "Compute"]);
    expect(categories[0]?.definitions.map((definition) => definition.type)).toEqual(["client"]);
  });

  it("keeps a component it has no section for, under Other", () => {
    const unknown = { type: "teapot", label: "Teapot" } as ComponentDefinition;
    expect(groupByCategory([unknown])).toEqual([{ id: "other", name: "Other", definitions: [unknown] }]);
  });
});
