import type { ComponentDefinition } from "@rectangles/engine";
import { registry, validateConfig } from "@rectangles/engine";
import type { ComponentConfig } from "../types";

/** Every component the engine can simulate, in registration order. */
export function listComponentDefinitions(): ComponentDefinition[] {
  return [...registry.values()].map((component) => component.definition);
}

export function findComponentDefinition(componentType: string): ComponentDefinition | undefined {
  return registry.get(componentType)?.definition;
}

/** The config with defaults filled in, or `null` for an unknown component or invalid config. */
function validatedConfig(componentType: string, config: ComponentConfig) {
  const definition = findComponentDefinition(componentType);
  if (definition === undefined) {
    return null;
  }
  const validation = validateConfig(definition.configFields, config);
  return validation.ok ? { definition, config: validation.config } : null;
}

/** A component's config with every field at its default. */
export function defaultConfigFor(componentType: string): ComponentConfig {
  return completeConfig(componentType, {});
}

/**
 * Fills in defaults for fields a saved config lacks, for example a field added to a
 * component after the board was saved. A config that is invalid is returned untouched,
 * so the inspector can show what is wrong instead of silently changing it.
 */
export function completeConfig(componentType: string, config: ComponentConfig): ComponentConfig {
  return validatedConfig(componentType, config)?.config ?? config;
}

/**
 * A component's most important settings in one short line, for showing on the
 * component itself. `null` for an unknown component or settings that are not valid.
 */
export function summariseConfig(componentType: string, config: ComponentConfig): string | null {
  const validated = validatedConfig(componentType, config);
  return validated === null ? null : validated.definition.summarise(validated.config);
}
