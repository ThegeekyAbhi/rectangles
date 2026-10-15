import type { Behaviour, ComponentRegistry } from "../contract/component-definition.ts";
import type { Context, RandomSource, SetupContext, TimerHandle } from "../contract/context.ts";
import type { MetricHandle } from "../contract/metric.ts";
import type { PortHandle } from "../contract/port.ts";
import type { Call, Outcome, Request } from "../contract/request.ts";
import type { Micros } from "../contract/time-units.ts";
import { MICROS_PER_SECOND, secondsToMicros } from "../contract/time-units.ts";
import { CounterSeries, MetricRecorder } from "../metrics/metric-recorder.ts";
import type { RunResult } from "../metrics/run-result.ts";
import { buildRunResult } from "../metrics/run-result.ts";
import type { RecordedRun, RunSnapshot, StopReason } from "../metrics/run-snapshot.ts";
import { buildRunSnapshot } from "../metrics/run-snapshot.ts";
import type { ValidatedConfig } from "./config-validation.ts";
import type { GraphNode } from "./design-graph.ts";
import { buildDesignGraph } from "./design-graph.ts";
import { EventQueue } from "./event-queue.ts";
import { Prng } from "./prng.ts";

export const DEFAULT_MAX_EVENTS = 2_000_000;
export const DEFAULT_MAX_SIMULATED_SECONDS = 600;

const EVENT_ARRIVE = 0;
const EVENT_REPLY = 1;
const EVENT_TIMER = 2;
const NO_CALL = -1;

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

/** A pooled call. The fields beyond `Call` belong to the kernel. */
class CallRecord implements Call {
  readonly slot: number;
  request: Request = { id: -1, attempt: 0, createdAtMicros: 0 };
  sentAtMicros: Micros = 0;
  parent: Call | null = null;
  callerScratchA = 0;
  callerScratchB = 0;
  calleeScratchA = 0;
  calleeScratchB = 0;
  callerIndex = -1;
  calleeIndex = -1;
  edgeIndex = -1;
  outcome: Outcome = "ok";
  isLive = false;
  isReplied = false;

  constructor(slot: number) {
    this.slot = slot;
  }
}

class NodeSetupContext implements SetupContext<unknown> {
  readonly config: ValidatedConfig;
  private readonly node: GraphNode;
  private readonly metricHandleById: ReadonlyMap<string, MetricHandle>;

  constructor(node: GraphNode, metricHandleById: ReadonlyMap<string, MetricHandle>) {
    this.node = node;
    this.config = node.config;
    this.metricHandleById = metricHandleById;
  }

  metric(metricId: string): MetricHandle {
    const handle = this.metricHandleById.get(metricId);
    if (handle === undefined) {
      throw new Error(
        `Component "${this.node.component.definition.type}" did not declare metric "${metricId}".`,
      );
    }
    return handle;
  }

  port(portId: string): PortHandle {
    const index = this.node.component.definition.ports.findIndex((port) => port.id === portId);
    if (index === -1) {
      throw new Error(
        `Component "${this.node.component.definition.type}" did not declare port "${portId}".`,
      );
    }
    return index;
  }
}

class NodeContext implements Context<unknown, unknown> {
  readonly config: ValidatedConfig;
  readonly prng: RandomSource;
  state: unknown = undefined;
  private readonly engine: SimulationEngine;
  private readonly nodeIndex: number;

  constructor(engine: SimulationEngine, nodeIndex: number, node: GraphNode, prng: RandomSource) {
    this.engine = engine;
    this.nodeIndex = nodeIndex;
    this.config = node.config;
    this.prng = prng;
  }

  get nowMicros(): Micros {
    return this.engine.nowMicros;
  }

  schedule(
    delayMicros: Micros,
    timerKind: number,
    call: Call | null = null,
    argument = 0,
  ): TimerHandle {
    return this.engine.scheduleTimer(this.nodeIndex, delayMicros, timerKind, call, argument);
  }

  cancel(timer: TimerHandle): void {
    this.engine.cancelTimer(timer);
  }

  createRequest(attempt: number): Request {
    return this.engine.createRequest(attempt);
  }

  targetCount(port: PortHandle): number {
    return this.engine.targetsOf(this.nodeIndex, port).length;
  }

  send(port: PortHandle, request: Request, parent: Call | null = null, targetIndex = 0): Call {
    return this.engine.send(this.nodeIndex, port, request, parent, targetIndex);
  }

  reply(call: Call, outcome: Outcome): void {
    this.engine.reply(this.nodeIndex, call, outcome);
  }

  count(metric: MetricHandle, amount = 1): void {
    this.engine.recorder.count(metric, amount, this.engine.nowMicros);
  }

  setGauge(metric: MetricHandle, value: number): void {
    this.engine.recorder.setGauge(metric, value, this.engine.nowMicros);
  }

  sample(metric: MetricHandle, value: number): void {
    this.engine.recorder.sample(metric, value, this.engine.nowMicros);
  }
}

/** Calls along one edge. Counted by the kernel, so no component can get them wrong. */
interface RuntimeEdge {
  readonly id: string;
  readonly sent: CounterSeries;
  replied: number;
}

interface RuntimeNode {
  readonly graphNode: GraphNode;
  readonly behaviour: Behaviour<unknown, unknown>;
  readonly context: NodeContext;
  callsReceived: number;
  callsReplied: number;
}

/**
 * The event loop. It schedules events, advances the clock and routes calls between
 * nodes. It knows nothing about what any component does.
 */
class SimulationEngine implements Simulation {
  nowMicros: Micros = 0;
  stopReason: StopReason | null = null;
  readonly recorder: MetricRecorder;

  private readonly seed: number;
  private readonly endMicros: Micros;
  private readonly endReason: StopReason;
  private readonly maxEvents: number;
  private readonly queue = new EventQueue();
  private readonly nodes: RuntimeNode[] = [];
  private readonly edges: RuntimeEdge[];
  private readonly calls: CallRecord[] = [];
  private readonly freeCalls: CallRecord[] = [];
  private eventsProcessed = 0;
  private nextRequestId = 0;

  constructor(design: unknown, options: SimulationOptions) {
    const graph = buildDesignGraph(design, options.registry);
    const maxEvents = options.limits?.maxEvents ?? DEFAULT_MAX_EVENTS;
    const maxSeconds = options.limits?.maxSimulatedSeconds ?? DEFAULT_MAX_SIMULATED_SECONDS;
    const isTimeLimited = graph.run.durationSeconds > maxSeconds;

    this.seed = graph.run.seed;
    this.maxEvents = maxEvents;
    this.endMicros = secondsToMicros(Math.min(graph.run.durationSeconds, maxSeconds));
    this.endReason = isTimeLimited ? "time-limit" : "completed";
    this.recorder = new MetricRecorder(
      MICROS_PER_SECOND,
      Math.max(1, Math.ceil(this.endMicros / MICROS_PER_SECOND)),
    );

    this.edges = graph.edgeIds.map((id) => ({
      id,
      sent: new CounterSeries(this.recorder.windowCount),
      replied: 0,
    }));

    graph.nodes.forEach((graphNode, nodeIndex) => {
      const { definition, behaviour } = graphNode.component;
      const metricHandleById = new Map<string, MetricHandle>();
      for (const spec of definition.metrics) {
        metricHandleById.set(spec.id, this.recorder.register(nodeIndex, spec));
      }
      const context = new NodeContext(
        this,
        nodeIndex,
        graphNode,
        new Prng(this.seed, graphNode.id),
      );
      context.state = behaviour.init(new NodeSetupContext(graphNode, metricHandleById));
      this.nodes.push({ graphNode, behaviour, context, callsReceived: 0, callsReplied: 0 });
    });

    for (const node of this.nodes) {
      node.behaviour.onStart?.(node.context);
    }
  }

  step(untilMicros: Micros): boolean {
    const queue = this.queue;
    while (this.stopReason === null) {
      const nextMicros = queue.peekTimeMicros();
      if (nextMicros >= this.endMicros) {
        this.nowMicros = this.endMicros;
        this.stopReason = this.endReason;
        break;
      }
      if (nextMicros > untilMicros) {
        this.nowMicros = Math.max(this.nowMicros, untilMicros);
        return false;
      }
      if (this.eventsProcessed >= this.maxEvents) {
        this.stopReason = "event-limit";
        break;
      }

      // Never empty: the peek above found a live event before the end of the run.
      const slot = queue.pop();
      const kind = queue.kind[slot];
      const node = this.nodes[queue.nodeIndex[slot] ?? -1];
      const callSlot = queue.callSlot[slot] ?? NO_CALL;
      const timerKind = queue.timerKind[slot] ?? 0;
      const argument = queue.argument[slot] ?? 0;
      queue.release(slot);

      this.nowMicros = nextMicros;
      this.eventsProcessed++;
      if (node === undefined) {
        continue;
      }
      const call = callSlot === NO_CALL ? null : (this.calls[callSlot] ?? null);

      if (kind === EVENT_TIMER) {
        node.behaviour.onTimer?.(node.context, timerKind, call, argument);
      } else if (call === null) {
        continue;
      } else if (kind === EVENT_ARRIVE) {
        if (node.behaviour.onArrive === undefined) {
          throw new Error(
            `Component "${node.graphNode.component.definition.type}" received a call but has no onArrive handler.`,
          );
        }
        node.behaviour.onArrive(node.context, call);
      } else {
        node.behaviour.onReply?.(node.context, call, call.outcome);
        this.releaseCall(call);
      }
    }
    return true;
  }

  result(): RunResult {
    return buildRunResult(this.recordedRun());
  }

  snapshot(fromWindow = 0): RunSnapshot {
    return buildRunSnapshot(this.recordedRun(), fromWindow);
  }

  scheduleTimer(
    nodeIndex: number,
    delayMicros: Micros,
    timerKind: number,
    call: Call | null,
    argument: number,
  ): TimerHandle {
    if (!(delayMicros >= 0)) {
      throw new RangeError(`A timer delay must be zero or more, got ${delayMicros}.`);
    }
    const callSlot = call === null ? NO_CALL : (call as CallRecord).slot;
    return this.queue.push(
      this.nowMicros + delayMicros,
      EVENT_TIMER,
      nodeIndex,
      callSlot,
      timerKind,
      argument,
    );
  }

  cancelTimer(timer: TimerHandle): void {
    this.queue.cancel(timer);
  }

  createRequest(attempt: number): Request {
    return { id: this.nextRequestId++, attempt, createdAtMicros: this.nowMicros };
  }

  targetsOf(nodeIndex: number, port: PortHandle): readonly number[] {
    const targets = this.nodes[nodeIndex]?.graphNode.targetsByPort[port];
    if (targets === undefined) {
      throw new RangeError(`Port handle ${port} does not belong to this component.`);
    }
    return targets;
  }

  send(
    callerIndex: number,
    port: PortHandle,
    request: Request,
    parent: Call | null,
    targetIndex: number,
  ): Call {
    const calleeIndex = this.targetsOf(callerIndex, port)[targetIndex];
    const callee = calleeIndex === undefined ? undefined : this.nodes[calleeIndex];
    const edgeIndex = this.nodes[callerIndex]?.graphNode.edgesByPort[port]?.[targetIndex];
    const edge = edgeIndex === undefined ? undefined : this.edges[edgeIndex];
    if (
      calleeIndex === undefined ||
      callee === undefined ||
      edgeIndex === undefined ||
      edge === undefined
    ) {
      throw new RangeError(`Nothing is connected at target ${targetIndex} of port handle ${port}.`);
    }
    const call = this.freeCalls.pop() ?? this.createCallRecord();
    call.request = request;
    call.sentAtMicros = this.nowMicros;
    call.parent = parent;
    call.callerScratchA = 0;
    call.callerScratchB = 0;
    call.calleeScratchA = 0;
    call.calleeScratchB = 0;
    call.callerIndex = callerIndex;
    call.calleeIndex = calleeIndex;
    call.edgeIndex = edgeIndex;
    call.isLive = true;
    call.isReplied = false;
    callee.callsReceived++;
    this.recorder.countInto(edge.sent, 1, this.nowMicros);
    this.queue.push(this.nowMicros, EVENT_ARRIVE, calleeIndex, call.slot, 0, 0);
    return call;
  }

  reply(calleeIndex: number, call: Call, outcome: Outcome): void {
    const record = call as CallRecord;
    const callee = this.nodes[calleeIndex];
    if (callee === undefined || record.calleeIndex !== calleeIndex || !record.isLive) {
      throw new Error("A component replied to a call that was not sent to it.");
    }
    if (record.isReplied) {
      throw new Error("A component replied to the same call twice.");
    }
    record.isReplied = true;
    record.outcome = outcome;
    callee.callsReplied++;
    const edge = this.edges[record.edgeIndex];
    if (edge !== undefined) {
      edge.replied++;
    }
    this.queue.push(this.nowMicros, EVENT_REPLY, record.callerIndex, record.slot, 0, 0);
  }

  private recordedRun(): RecordedRun {
    return {
      seed: this.seed,
      stopReason: this.stopReason,
      nowMicros: this.nowMicros,
      eventsProcessed: this.eventsProcessed,
      recorder: this.recorder,
      nodes: this.nodes.map((node) => ({
        id: node.graphNode.id,
        type: node.graphNode.component.definition.type,
        callsReceived: node.callsReceived,
        callsReplied: node.callsReplied,
      })),
      edges: this.edges,
    };
  }

  private createCallRecord(): CallRecord {
    const record = new CallRecord(this.calls.length);
    this.calls.push(record);
    return record;
  }

  private releaseCall(call: CallRecord): void {
    call.isLive = false;
    call.parent = null;
    this.freeCalls.push(call);
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
