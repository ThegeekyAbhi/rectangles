import type { ConfigFields, ConfigOf } from "../contract/config-field.ts";
import type { Context, RandomSource, SetupContext, TimerHandle } from "../contract/context.ts";
import type { MetricHandle } from "../contract/metric.ts";
import type { PortHandle } from "../contract/port.ts";
import type { Call, Operation, Outcome, Request } from "../contract/request.ts";
import type { CpuHandle, CpuMetrics, WorkDistribution } from "../contract/resources.ts";
import type { Micros } from "../contract/time-units.ts";
import type { MetricRecorder } from "../metrics/metric-recorder.ts";
import type { ValidatedConfig } from "./config-validation.ts";
import type { GraphNode } from "./design-graph.ts";
import { CpuPool } from "./resources/cpu-pool.ts";

/** The run's clock. */
export interface Clock {
  readonly nowMicros: Micros;
}

/** What the kernel offers every node during a run. `Context` adapts it to one node. */
export interface KernelServices {
  readonly clock: Clock;
  readonly recorder: MetricRecorder;
  scheduleTimer(
    nodeIndex: number,
    delayMicros: Micros,
    timerKind: number,
    call: Call | null,
    argument: number,
  ): TimerHandle;
  cancelTimer(timer: TimerHandle): void;
  /** Schedules the end of a piece of CPU work on one of a node's pools. */
  scheduleCpuDone(nodeIndex: number, delayMicros: Micros, timerKind: number, call: Call, poolIndex: number): void;
  createRequest(attempt: number, operation: Operation, key: number): Request;
  targetsOf(nodeIndex: number, port: PortHandle): readonly number[];
  send(callerIndex: number, port: PortHandle, request: Request, parent: Call | null, targetIndex: number): Call;
  reply(calleeIndex: number, call: Call, outcome: Outcome): void;
}

/** What one component sees while it is being set up. */
export class NodeSetupContext implements SetupContext<unknown> {
  readonly config: ValidatedConfig;
  private readonly node: GraphNode;
  private readonly metricHandleById: ReadonlyMap<string, MetricHandle>;
  private readonly context: NodeContext;

  constructor(node: GraphNode, metricHandleById: ReadonlyMap<string, MetricHandle>, context: NodeContext) {
    this.node = node;
    this.config = node.config;
    this.metricHandleById = metricHandleById;
    this.context = context;
  }

  cpu(cores: number, metrics: CpuMetrics): CpuHandle {
    return this.context.addCpuPool(cores, metrics);
  }

  metric(metricId: string): MetricHandle {
    const handle = this.metricHandleById.get(metricId);
    if (handle === undefined) {
      throw new Error(`Component "${this.componentType}" did not declare metric "${metricId}".`);
    }
    return handle;
  }

  port(portId: string): PortHandle {
    const index = this.node.component.definition.ports.findIndex((port) => port.id === portId);
    if (index === -1) {
      throw new Error(`Component "${this.componentType}" did not declare port "${portId}".`);
    }
    return index;
  }

  connections<Fields extends ConfigFields>(port: PortHandle, fields: Fields): readonly ConfigOf<Fields>[] {
    const spec = this.node.component.definition.ports[port];
    const configs = this.node.connectionConfigsByPort[port];
    if (spec === undefined || configs === undefined) {
      throw new RangeError(`Port handle ${port} does not belong to this component.`);
    }
    if (spec.connectionFields !== fields) {
      throw new Error(
        `Component "${this.componentType}" asked for connections of port "${spec.id}" with fields that port does not declare.`,
      );
    }
    // Safe: every entry was validated against exactly these fields when the graph was built.
    return configs as readonly ConfigOf<Fields>[];
  }

  private get componentType(): string {
    return this.node.component.definition.type;
  }
}

/** What one component sees during a run: the kernel's services, bound to its node. */
export class NodeContext implements Context<unknown, unknown> {
  readonly config: ValidatedConfig;
  readonly prng: RandomSource;
  state: unknown = undefined;
  private readonly services: KernelServices;
  // Held directly, not read through `services`, because every handler reads the clock.
  private readonly clock: Clock;
  private readonly recorder: MetricRecorder;
  private readonly nodeIndex: number;
  private readonly cpuPools: CpuPool[] = [];

  constructor(services: KernelServices, nodeIndex: number, node: GraphNode, prng: RandomSource) {
    this.services = services;
    this.clock = services.clock;
    this.recorder = services.recorder;
    this.nodeIndex = nodeIndex;
    this.config = node.config;
    this.prng = prng;
  }

  get nowMicros(): Micros {
    return this.clock.nowMicros;
  }

  schedule(
    delayMicros: Micros,
    timerKind: number,
    call: Call | null = null,
    argument = 0,
  ): TimerHandle {
    return this.services.scheduleTimer(this.nodeIndex, delayMicros, timerKind, call, argument);
  }

  cancel(timer: TimerHandle): void {
    this.services.cancelTimer(timer);
  }

  useCpu(cpu: CpuHandle, call: Call, meanMicros: Micros, distribution: WorkDistribution, timerKind: number): void {
    this.cpuPool(cpu).use(call, meanMicros, distribution, timerKind);
  }

  /** Set-up only: adds a CPU pool to this node. */
  addCpuPool(cores: number, metrics: CpuMetrics): CpuHandle {
    const pool = new CpuPool(this.cpuPools.length, cores, metrics, {
      setGauge: (metric, value) => {
        this.setGauge(metric, value);
      },
      nextExponential: (mean) => this.prng.nextExponential(mean),
      scheduleDone: (delayMicros, timerKind, call, poolIndex) => {
        this.services.scheduleCpuDone(this.nodeIndex, delayMicros, timerKind, call, poolIndex);
      },
    });
    this.cpuPools.push(pool);
    return pool.index;
  }

  /** Kernel only: a piece of work on pool `poolIndex` has ended. */
  finishCpuWork(poolIndex: number): void {
    this.cpuPool(poolIndex).finish();
  }

  private cpuPool(handle: CpuHandle): CpuPool {
    const pool = this.cpuPools[handle];
    if (pool === undefined) {
      throw new RangeError(`CPU handle ${handle} does not belong to this component.`);
    }
    return pool;
  }

  createRequest(attempt: number, operation: Operation = "read", key = 0): Request {
    return this.services.createRequest(attempt, operation, key);
  }

  targetCount(port: PortHandle): number {
    return this.services.targetsOf(this.nodeIndex, port).length;
  }

  send(port: PortHandle, request: Request, parent: Call | null = null, targetIndex = 0): Call {
    return this.services.send(this.nodeIndex, port, request, parent, targetIndex);
  }

  reply(call: Call, outcome: Outcome): void {
    this.services.reply(this.nodeIndex, call, outcome);
  }

  count(metric: MetricHandle, amount = 1): void {
    this.recorder.count(metric, amount, this.clock.nowMicros);
  }

  setGauge(metric: MetricHandle, value: number): void {
    this.recorder.setGauge(metric, value, this.clock.nowMicros);
  }

  sample(metric: MetricHandle, value: number): void {
    this.recorder.sample(metric, value, this.clock.nowMicros);
  }
}
