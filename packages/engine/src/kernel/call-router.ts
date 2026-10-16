import type { TimerHandle } from "../contract/context.ts";
import type { PortHandle } from "../contract/port.ts";
import type { Call, Operation, Outcome, Request } from "../contract/request.ts";
import type { Micros } from "../contract/time-units.ts";
import type { MetricRecorder } from "../metrics/metric-recorder.ts";
import type { CallPool, CallRecord } from "./call-pool.ts";
import { NO_CALL } from "./call-pool.ts";
import type { EventQueue } from "./des/event-queue.ts";
import type { EventDispatcher, EventLoop } from "./des/event-loop.ts";
import type { DesignGraph } from "./design-graph.ts";
import type { KernelServices } from "./node-context.ts";
import type { RuntimeEdge, RuntimeNode } from "./runtime-graph.ts";
import { buildRuntimeNodes } from "./runtime-graph.ts";

/** The three kinds of event. Adding one means adding it here and to `dispatch`. */
const EVENT_ARRIVE = 0;
const EVENT_REPLY = 1;
const EVENT_TIMER = 2;

/**
 * Moves calls between nodes: sends, replies and timers become events, and events become
 * handler calls. Implements the services every `Context` uses.
 */
export class CallRouter implements KernelServices, EventDispatcher {
  readonly clock: EventLoop;
  readonly recorder: MetricRecorder;
  /** Built here, because each node's context needs this router. */
  readonly nodes: readonly RuntimeNode[];
  private readonly queue: EventQueue;
  private readonly pool: CallPool;
  private readonly edges: readonly RuntimeEdge[];
  private nextRequestId = 0;

  constructor(
    graph: DesignGraph,
    loop: EventLoop,
    pool: CallPool,
    recorder: MetricRecorder,
    edges: readonly RuntimeEdge[],
  ) {
    this.clock = loop;
    this.queue = loop.queue;
    this.pool = pool;
    this.recorder = recorder;
    this.edges = edges;
    // Last: building a node's context reads `clock` and `recorder` from this router.
    this.nodes = buildRuntimeNodes(graph, recorder, this);
  }

  dispatch(kind: number, nodeIndex: number, callSlot: number, timerKind: number, argument: number): void {
    const node = this.nodes[nodeIndex];
    if (node === undefined) {
      return;
    }
    const call = this.pool.callAt(callSlot);
    if (kind === EVENT_TIMER) {
      node.behaviour.onTimer?.(node.context, timerKind, call, argument);
    } else if (call === null) {
      return;
    } else if (kind === EVENT_ARRIVE) {
      if (node.behaviour.onArrive === undefined) {
        throw new Error(
          `Component "${node.graphNode.component.definition.type}" received a call but has no onArrive handler.`,
        );
      }
      node.behaviour.onArrive(node.context, call);
    } else if (kind === EVENT_REPLY) {
      node.behaviour.onReply?.(node.context, call, call.outcome);
      this.pool.release(call);
    }
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
    return this.queue.push(this.clock.nowMicros + delayMicros, EVENT_TIMER, nodeIndex, callSlot, timerKind, argument);
  }

  cancelTimer(timer: TimerHandle): void {
    this.queue.cancel(timer);
  }

  createRequest(attempt: number, operation: Operation, key: number): Request {
    return { id: this.nextRequestId++, attempt, createdAtMicros: this.clock.nowMicros, operation, key };
  }

  targetsOf(nodeIndex: number, port: PortHandle): readonly number[] {
    const targets = this.nodes[nodeIndex]?.graphNode.targetsByPort[port];
    if (targets === undefined) {
      throw new RangeError(`Port handle ${port} does not belong to this component.`);
    }
    return targets;
  }

  send(callerIndex: number, port: PortHandle, request: Request, parent: Call | null, targetIndex: number): Call {
    // Resolved inline rather than through a helper returning an object: sending must not allocate.
    const calleeIndex = this.targetsOf(callerIndex, port)[targetIndex];
    const callee = calleeIndex === undefined ? undefined : this.nodes[calleeIndex];
    const edgeIndex = this.nodes[callerIndex]?.graphNode.edgesByPort[port]?.[targetIndex];
    const edge = edgeIndex === undefined ? undefined : this.edges[edgeIndex];
    if (calleeIndex === undefined || callee === undefined || edgeIndex === undefined || edge === undefined) {
      throw new RangeError(`Nothing is connected at target ${targetIndex} of port handle ${port}.`);
    }
    const nowMicros = this.clock.nowMicros;
    const call = this.pool.acquire();
    call.request = request;
    call.sentAtMicros = nowMicros;
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
    this.recorder.countInto(edge.sent, 1, nowMicros);
    this.queue.push(nowMicros, EVENT_ARRIVE, calleeIndex, call.slot, 0, 0);
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
    this.queue.push(this.clock.nowMicros, EVENT_REPLY, record.callerIndex, record.slot, 0, 0);
  }
}
