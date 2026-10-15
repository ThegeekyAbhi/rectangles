import type { ComponentDefinition } from "@rectangles/engine";
import { findComponentDefinition } from "./component-catalog";

/** A section of the library. Each has its own colour except `other`, for unknown types. */
export type ComponentCategoryId = "traffic" | "compute" | "data" | "messaging" | "other";

/** The library's sections, in the order a request meets them. */
const CATEGORY_NAMES: Readonly<Record<ComponentCategoryId, string>> = {
  traffic: "Traffic",
  compute: "Compute",
  data: "Data",
  messaging: "Messaging",
  other: "Other",
};

export interface ComponentCategory {
  readonly id: ComponentCategoryId;
  readonly name: string;
  readonly definitions: readonly ComponentDefinition[];
}

/**
 * The section a component belongs to, as its engine definition declares. A type this
 * version does not know (kept on the board from elsewhere) is `other`.
 */
export function categoryOf(componentType: string): ComponentCategoryId {
  return findComponentDefinition(componentType)?.category ?? "other";
}

/** Tailwind class colouring each section's icons. Written out in full so Tailwind finds them. */
const TEXT_CLASS_BY_CATEGORY: Readonly<Record<ComponentCategoryId, string>> = {
  traffic: "text-category-traffic",
  compute: "text-category-compute",
  data: "text-category-data",
  messaging: "text-category-messaging",
  other: "text-foreground",
};

/** The text colour class for a component's icon, from the section it belongs to. */
export function categoryTextClass(componentType: string): string {
  return TEXT_CLASS_BY_CATEGORY[categoryOf(componentType)];
}

/** Sorts components into the library's sections, leaving out sections with nothing in them. */
export function groupByCategory(definitions: readonly ComponentDefinition[]): ComponentCategory[] {
  const byId = new Map<ComponentCategoryId, ComponentDefinition[]>();
  for (const definition of definitions) {
    const id = categoryOf(definition.type);
    byId.set(id, [...(byId.get(id) ?? []), definition]);
  }
  return (Object.keys(CATEGORY_NAMES) as ComponentCategoryId[]).flatMap((id) => {
    const inCategory = byId.get(id);
    return inCategory === undefined ? [] : [{ id, name: CATEGORY_NAMES[id], definitions: inCategory }];
  });
}
