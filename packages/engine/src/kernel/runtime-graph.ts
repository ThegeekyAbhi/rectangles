import type { Behaviour } from "../contract/component-definition.ts";
import type { MetricHandle } from "../contract/metric.ts";
import { CounterSeries } from "../metrics/metric-recorder.ts";
import type { MetricRecorder } from "../metrics/metric-recorder.ts";
import type { RecordedRun, StopReason } from "../metrics/run-snapshot.ts";
import type { DesignGraph, GraphNode } from "./design-graph.ts";
import type { KernelServices } from "./node-context.ts";
import { NodeContext, NodeSetupContext } from "./node-context.ts";
import { Prng } from "./prng.ts";

/** Calls along one edge. Counted by the kernel, so no component can get them wrong. */
export interface RuntimeEdge {
  readonly id: string;
  readonly sent: CounterSeries;
  replied: number;
}

/** A node as the run sees it: its component's handlers, its context and its call counts. */
export interface RuntimeNode {
  readonly graphNode: GraphNode;
  readonly behaviour: Behaviour<unknown, unknown>;
  readonly context: NodeContext;
  callsReceived: number;
  callsReplied: number;
}

export function buildRuntimeEdges(graph: DesignGraph, recorder: MetricRecorder): RuntimeEdge[] {
  return graph.edgeIds.map((id) => ({
    id,
    sent: new CounterSeries(recorder.windowCount),
    replied: 0,
  }));
}

/**
 * Registers each node's declared metrics, gives it a random stream derived from the seed
 * and its id, and runs its `init`. Nothing is scheduled yet.
 */
export function buildRuntimeNodes(
  graph: DesignGraph,
  recorder: MetricRecorder,
  services: KernelServices,
): RuntimeNode[] {
  return graph.nodes.map((graphNode, nodeIndex) => {
    const { definition, behaviour } = graphNode.component;
    const metricHandleById = new Map<string, MetricHandle>();
    for (const spec of definition.metrics) {
      metricHandleById.set(spec.id, recorder.register(nodeIndex, spec));
    }
    const context = new NodeContext(services, nodeIndex, graphNode, new Prng(graph.run.seed, graphNode.id));
    context.state = behaviour.init(new NodeSetupContext(graphNode, metricHandleById));
    return { graphNode, behaviour, context, callsReceived: 0, callsReplied: 0 };
  });
}

/** Runs each node's `onStart`, in design order. */
export function startNodes(nodes: readonly RuntimeNode[]): void {
  for (const node of nodes) {
    node.behaviour.onStart?.(node.context);
  }
}

export interface RunProgressState {
  readonly seed: number;
  readonly stopReason: StopReason | null;
  readonly nowMicros: number;
  readonly eventsProcessed: number;
}

/** Everything the metrics layer needs to describe a run, so far or at its end. */
export function toRecordedRun(
  progress: RunProgressState,
  recorder: MetricRecorder,
  nodes: readonly RuntimeNode[],
  edges: readonly RuntimeEdge[],
): RecordedRun {
  return {
    seed: progress.seed,
    stopReason: progress.stopReason,
    nowMicros: progress.nowMicros,
    eventsProcessed: progress.eventsProcessed,
    recorder,
    nodes: nodes.map((node) => ({
      id: node.graphNode.id,
      type: node.graphNode.component.definition.type,
      callsReceived: node.callsReceived,
      callsReplied: node.callsReplied,
    })),
    edges,
  };
}
