import type { ConfigFields } from "../contract/config-field.ts";

export interface ConfigIssue {
  readonly field: string;
  readonly message: string;
}

export type ValidatedConfig = Readonly<Record<string, number | string>>;

export type ConfigValidation =
  | { readonly ok: true; readonly config: ValidatedConfig }
  | { readonly ok: false; readonly issues: readonly ConfigIssue[] };

/**
 * Checks a raw config object against a component's field specs and fills in defaults.
 * Unknown fields are reported, never silently dropped.
 */
export function validateConfig(fields: ConfigFields, rawConfig: unknown): ConfigValidation {
  if (rawConfig !== undefined && (typeof rawConfig !== "object" || rawConfig === null || Array.isArray(rawConfig))) {
    return { ok: false, issues: [{ field: "", message: "Config must be an object." }] };
  }
  const provided = (rawConfig ?? {}) as Record<string, unknown>;
  const issues: ConfigIssue[] = [];
  const config: Record<string, number | string> = {};

  for (const field of Object.keys(provided)) {
    if (!Object.hasOwn(fields, field)) {
      issues.push({ field, message: `Unknown field "${field}".` });
    }
  }

  for (const [field, spec] of Object.entries(fields)) {
    const value = Object.hasOwn(provided, field) ? provided[field] : undefined;
    if (value === undefined) {
      config[field] = spec.default;
      continue;
    }
    if (spec.kind === "choice") {
      if (typeof value !== "string" || !spec.options.includes(value)) {
        issues.push({ field, message: `Must be one of: ${spec.options.join(", ")}.` });
        continue;
      }
      config[field] = value;
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      issues.push({ field, message: "Must be a number." });
      continue;
    }
    if (spec.kind === "integer" && !Number.isInteger(value)) {
      issues.push({ field, message: "Must be a whole number." });
      continue;
    }
    if (value < spec.min || value > spec.max) {
      const unit = spec.unit === undefined ? "" : ` ${spec.unit}`;
      issues.push({ field, message: `Must be between ${spec.min} and ${spec.max}${unit}.` });
      continue;
    }
    config[field] = value;
  }

  return issues.length === 0 ? { ok: true, config } : { ok: false, issues };
}
