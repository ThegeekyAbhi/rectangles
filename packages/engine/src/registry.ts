import type {
  ComponentRegistry,
  RegisteredComponent,
} from "./contract/component-definition.ts";
import { apiServerComponent } from "./components/api-server/behaviour.ts";
import { clientComponent } from "./components/client/behaviour.ts";

/** Builds a registry, rejecting two components that claim the same type. */
export function createRegistry(components: readonly RegisteredComponent[]): ComponentRegistry {
  const registry = new Map<string, RegisteredComponent>();
  for (const component of components) {
    const { type } = component.definition;
    if (registry.has(type)) {
      throw new Error(`Component type "${type}" is registered twice.`);
    }
    registry.set(type, component);
  }
  return registry;
}

/** Every component the engine ships with. Adding one is one line here. */
export const registry = createRegistry([
  clientComponent,
  apiServerComponent,
]);
