import type { ComponentRegistry } from "../contract/component-definition.ts";
import type { Micros } from "../contract/time-units.ts";
import { MICROS_PER_SECOND, secondsToMicros } from "../contract/time-units.ts";
import { MetricRecorder } from "../metrics/metric-recorder.ts";
import type { RunResult } from "../metrics/run-result.ts";
import { buildRunResult } from "../metrics/run-result.ts";
import type { RecordedRun, RunSnapshot, StopReason } from "../metrics/run-snapshot.ts";
import { buildRunSnapshot } from "../metrics/run-snapshot.ts";
import { CallPool } from "./call-pool.ts";
import { CallRouter } from "./call-router.ts";
import { EventLoop } from "./des/event-loop.ts";
import { buildDesignGraph } from "./design-graph.ts";
import type { RuntimeEdge, RuntimeNode } from "./runtime-graph.ts";
import { buildRuntimeEdges, startNodes, toRecordedRun } from "./runtime-graph.ts";

export const DEFAULT_MAX_EVENTS = 2_000_000;
export const DEFAULT_MAX_SIMULATED_SECONDS = 600;

export interface SimulationLimits {
  readonly maxEvents: number;
  readonly maxSimulatedSeconds: number;
}

export interface SimulationOptions {
  readonly registry: ComponentRegistry;
  readonly limits?: Partial<SimulationLimits>;
}

export interface Simulation {
  readonly nowMicros: Micros;
  /** Events handled so far; the run stops once this reaches the event limit. */
  readonly eventsProcessed: number;
  /** `null` until the run has ended. */
  readonly stopReason: StopReason | null;
  /**
   * Processes events up to and including `untilMicros`, then returns.
   * @returns `true` once the run has ended.
   */
  step(untilMicros: Micros): boolean;
  /** Metrics so far. May be called while the run is in progress. */
  result(): RunResult;
  /**
   * Metrics so far without whole-run percentiles, reporting only the windows from
   * `fromWindow` on. Cheap enough to call many times a second during a run.
   */
  snapshot(fromWindow?: number): RunSnapshot;
}

/**
 * One run of a design. It puts the parts together and owns none of their work: the event
 * loop orders events in time, the router turns them into handler calls, and the recorder
 * keeps the metrics.
 */
class SimulationEngine implements Simulation {
  readonly seed: number;
  private readonly loop: EventLoop;
  private readonly router: CallRouter;
  private readonly recorder: MetricRecorder;
  private readonly nodes: readonly RuntimeNode[];
  private readonly edges: readonly RuntimeEdge[];

  constructor(design: unknown, options: SimulationOptions) {
    const graph = buildDesignGraph(design, options.registry);
    const maxEvents = options.limits?.maxEvents ?? DEFAULT_MAX_EVENTS;
    const maxSeconds = options.limits?.maxSimulatedSeconds ?? DEFAULT_MAX_SIMULATED_SECONDS;
    const endMicros = secondsToMicros(Math.min(graph.run.durationSeconds, maxSeconds));

    this.seed = graph.run.seed;
    this.loop = new EventLoop({
      endMicros,
      endReason: graph.run.durationSeconds > maxSeconds ? "time-limit" : "completed",
      maxEvents,
    });
    this.recorder = new MetricRecorder(MICROS_PER_SECOND, Math.max(1, Math.ceil(endMicros / MICROS_PER_SECOND)));
    this.edges = buildRuntimeEdges(graph, this.recorder);
    this.router = new CallRouter(graph, this.loop, new CallPool(), this.recorder, this.edges);
    this.nodes = this.router.nodes;
    startNodes(this.nodes);
  }

  get nowMicros(): Micros {
    return this.loop.nowMicros;
  }

  get eventsProcessed(): number {
    return this.loop.eventsProcessed;
  }

  get stopReason(): StopReason | null {
    return this.loop.stopReason;
  }

  step(untilMicros: Micros): boolean {
    return this.loop.step(untilMicros, this.router);
  }

  result(): RunResult {
    return buildRunResult(this.recordedRun());
  }

  snapshot(fromWindow = 0): RunSnapshot {
    return buildRunSnapshot(this.recordedRun(), fromWindow);
  }

  private recordedRun(): RecordedRun {
    return toRecordedRun(this, this.recorder, this.nodes, this.edges);
  }
}

/**
 * Prepares a run of the given design.
 * @throws {DesignError} if the design is malformed.
 */
export function createSimulation(design: unknown, options: SimulationOptions): Simulation {
  return new SimulationEngine(design, options);
}

/** Runs a design to the end and returns its result. */
export function runSimulation(design: unknown, options: SimulationOptions): RunResult {
  const simulation = createSimulation(design, options);
  simulation.step(Number.POSITIVE_INFINITY);
  return simulation.result();
}
