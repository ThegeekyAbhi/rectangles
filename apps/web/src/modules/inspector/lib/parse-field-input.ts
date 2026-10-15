import type { ConfigFields } from "@rectangles/engine";
import { validateConfig } from "@rectangles/engine";

export type FieldInput =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly message: string };

/**
 * Reads what was typed into a number field and checks it against the component's own
 * field specs. The engine's validator supplies the range messages, so the inspector
 * and the simulator can never disagree about what is allowed.
 */
export function parseNumberField(
  fields: ConfigFields,
  config: Readonly<Record<string, number | string>>,
  fieldName: string,
  text: string,
): FieldInput {
  const trimmed = text.trim();
  const value = Number(trimmed);
  if (trimmed === "" || !Number.isFinite(value)) {
    return { ok: false, message: "Enter a number." };
  }
  const validation = validateConfig(fields, { ...config, [fieldName]: value });
  const issue = validation.ok ? undefined : validation.issues.find((found) => found.field === fieldName);
  return issue === undefined ? { ok: true, value } : { ok: false, message: issue.message };
}

/** Whether a field applies, given the values of the fields it depends on. */
export function isFieldRelevant(
  fields: ConfigFields,
  config: Readonly<Record<string, number | string>>,
  fieldName: string,
): boolean {
  const relevance = fields[fieldName]?.relevantWhen;
  return relevance === undefined || relevance.isOneOf.includes(String(config[relevance.field]));
}

/** `least-connections` → `Least connections`. */
export function optionLabel(option: string): string {
  const words = option.replaceAll("-", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Short forms for units too long to sit beside a number in a narrow field. */
const SHORT_UNITS: Readonly<Record<string, string>> = {
  "requests/s": "req/s",
};

/** A unit as shown inside a field, such as `req/s` for `requests/s`. */
export function unitLabel(unit: string): string {
  return SHORT_UNITS[unit] ?? unit;
}
