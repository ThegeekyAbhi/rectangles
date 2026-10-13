import type { ConfigFields, ConfigOf } from "./config-field.ts";
import type { Context, SetupContext } from "./context.ts";
import type { MetricSpec } from "./metric.ts";
import type { PortSpec } from "./port.ts";
import type { Call, Outcome } from "./request.ts";

/** Everything about a component that can be known without running it. */
export interface ComponentDefinition<Fields extends ConfigFields = ConfigFields> {
  /** Unique kebab-case id, for example `api-server`. */
  readonly type: string;
  readonly label: string;
  readonly description: string;
  readonly configFields: Fields;
  readonly ports: readonly PortSpec[];
  readonly metrics: readonly MetricSpec[];
  /** Real-world behaviour this component deliberately leaves out. Shown in the product. */
  readonly notModeled: readonly string[];
  /**
   * The settings that matter most, in one short line shown on the component itself,
   * for example `2 × 50 slots · 20 ms`.
   */
  summarise(config: ConfigOf<Fields>): string;
}

/** What a component does. Every handler except `init` is optional. */
export interface Behaviour<Config, State> {
  /** Runs once per node before the run starts. Returns that node's private state. */
  init(setup: SetupContext<Config>): State;
  /** Runs once per node at time zero. */
  onStart?(context: Context<Config, State>): void;
  /** A call arrived on an in port. */
  onArrive?(context: Context<Config, State>, call: Call): void;
  /** A call this node sent was answered. */
  onReply?(context: Context<Config, State>, call: Call, outcome: Outcome): void;
  /** A timer this node scheduled has fired. */
  onTimer?(
    context: Context<Config, State>,
    timerKind: number,
    call: Call | null,
    argument: number,
  ): void;
}

export interface Component<Fields extends ConfigFields, State> {
  readonly definition: ComponentDefinition<Fields>;
  readonly behaviour: Behaviour<ConfigOf<Fields>, State>;
}

/** A component with its config and state types erased, as the engine stores it. */
export interface RegisteredComponent {
  readonly definition: ComponentDefinition;
  readonly behaviour: Behaviour<unknown, unknown>;
}

/**
 * Checks a component's handlers against its own field specs, then widens the types so
 * components of different shapes can share one registry.
 *
 * The widening is safe because the engine only ever hands a behaviour the config it
 * validated against this definition and the state its own `init` returned.
 */
export function defineComponent<Fields extends ConfigFields, State>(
  component: Component<Fields, State>,
): RegisteredComponent {
  return component;
}

export type ComponentRegistry = ReadonlyMap<string, RegisteredComponent>;
