import type { ComponentDefinition, ConfigFields } from "@rectangles/engine";
import { registry, validateConfig } from "@rectangles/engine";
import type { ComponentConfig, ConnectionConfig } from "../types";

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

/** The settings each connection leaving a component's port carries; empty when it has none. */
export function findConnectionFields(componentType: string, portId: string): ConfigFields {
  const port = findComponentDefinition(componentType)?.ports.find((candidate) => candidate.id === portId);
  return port?.connectionFields ?? {};
}

/**
 * A connection's settings with defaults filled in. Invalid settings are returned
 * untouched, as `completeConfig` does for a component.
 */
export function completeConnectionConfig(
  componentType: string,
  portId: string,
  config: ConnectionConfig,
): ConnectionConfig {
  const validation = validateConfig(findConnectionFields(componentType, portId), config);
  return validation.ok ? validation.config : config;
}

/**
 * A connection's settings that differ from their defaults, in one short line such as
 * `weight 25`. `null` when every setting is at its default.
 */
export function summariseConnection(componentType: string, portId: string, config: ConnectionConfig): string | null {
  const parts = Object.entries(findConnectionFields(componentType, portId)).flatMap(([name, field]) => {
    const value = config[name];
    return value === undefined || value === field.default ? [] : [`${field.label.toLowerCase()} ${value}`];
  });
  return parts.length === 0 ? null : parts.join(" · ");
}
