import type { ConfigField, ConfigFields, ValidatedConfig } from "@rectangles/engine";
import { isFieldRelevant } from "./parse-field-input";

export interface FieldSection {
  /** The heading, or `null` for fields that declare no section. */
  readonly title: string | null;
  readonly fields: readonly (readonly [name: string, field: ConfigField])[];
}

/**
 * The fields that apply right now, grouped under their sections in the order each section
 * first appears. Fields without a section come first, as one untitled group.
 */
export function groupFieldsBySection(fields: ConfigFields, config: ValidatedConfig): FieldSection[] {
  const groups = new Map<string | null, [string, ConfigField][]>();
  groups.set(null, []);
  for (const [name, field] of Object.entries(fields)) {
    if (!isFieldRelevant(fields, config, name)) {
      continue;
    }
    const title = field.section ?? null;
    const group = groups.get(title) ?? [];
    group.push([name, field]);
    groups.set(title, group);
  }
  return [...groups.entries()]
    .filter(([, group]) => group.length > 0)
    .map(([title, group]) => ({ title, fields: group }));
}
