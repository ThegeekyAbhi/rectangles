import type { MetricHandle } from "./metric.ts";
import type { PortHandle } from "./port.ts";
import type { Call, Outcome, Request } from "./request.ts";
import type { Micros } from "./time-units.ts";

/** A deterministic random stream. Each node has its own, derived from the run seed. */
export interface RandomSource {
  /** Uniform in [0, 1). */
  nextFloat(): number;
  /** Exponentially distributed with the given mean. */
  nextExponential(mean: number): number;
}

/** Opaque reference to a scheduled timer, used to cancel it. */
export type TimerHandle = number;

/** What a component can see while it is being set up, before the run starts. */
export interface SetupContext<Config> {
  readonly config: Config;
  /** Resolves a declared metric id. Throws if the component did not declare it. */
  metric(metricId: string): MetricHandle;
  /** Resolves a declared port id. Throws if the component did not declare it. */
  port(portId: string): PortHandle;
}

/**
 * Everything a component may do during a run. It is the component's only link to the
 * engine: components never import the kernel, the clock, or each other.
 */
export interface Context<Config, State> {
  readonly nowMicros: Micros;
  readonly config: Config;
  /** The value this node's `init` returned. */
  readonly state: State;
  readonly prng: RandomSource;

  /**
   * Calls this node's `onTimer` after `delayMicros`, passing back `timerKind`, `call`
   * and `argument` unchanged.
   */
  schedule(
    delayMicros: Micros,
    timerKind: number,
    call?: Call | null,
    argument?: number,
  ): TimerHandle;
  /** Cancels a timer. Does nothing if it has already fired. */
  cancel(timer: TimerHandle): void;

  createRequest(attempt: number): Request;
  /** Number of nodes connected to one of this node's out ports. */
  targetCount(port: PortHandle): number;
  /**
   * Sends a request out of a port. The target's `onArrive` runs next, and this node's
   * `onReply` runs once the target replies. Pass `parent` when forwarding an incoming call.
   */
  send(port: PortHandle, request: Request, parent?: Call | null, targetIndex?: number): Call;
  /** Answers an incoming call. Each call must be answered exactly once. */
  reply(call: Call, outcome: Outcome): void;

  /** Adds to a counter. */
  count(metric: MetricHandle, amount?: number): void;
  /** Sets the current level of a gauge. */
  setGauge(metric: MetricHandle, value: number): void;
  /** Records one value of a sample metric. */
  sample(metric: MetricHandle, value: number): void;
}
