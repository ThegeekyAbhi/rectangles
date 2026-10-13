import type { MetricSnapshot, RunSnapshot } from "@rectangles/engine";

/** Keeps the windows before `fromWindow` and replaces everything from it on. */
function mergeWindows<Window>(
  previous: readonly Window[] | undefined,
  next: readonly Window[],
  fromWindow: number,
): readonly Window[] {
  return previous === undefined ? next : [...previous.slice(0, fromWindow), ...next];
}

function mergeMetric<Metric extends MetricSnapshot>(
  earlier: MetricSnapshot | undefined,
  metric: Metric,
  fromWindow: number,
): Metric {
  const kept: readonly unknown[] | undefined = earlier?.kind === metric.kind ? earlier.windows : undefined;
  // Both are the same metric of the same run, so their windows hold the same kind of value.
  return { ...metric, windows: mergeWindows(kept, metric.windows, fromWindow) } as Metric;
}

/**
 * Adds a snapshot, which reports only its newest windows, to the metrics gathered so
 * far. The result always holds every window from the start of the run.
 *
 * Both must come from the same run, so their nodes, metrics and edges line up.
 */
export function mergeSnapshot(previous: RunSnapshot | null, next: RunSnapshot): RunSnapshot {
  const { fromWindow } = next;
  if (previous === null || fromWindow === 0) {
    return next;
  }
  return {
    ...next,
    fromWindow: 0,
    summary: {
      ...next.summary,
      windows: mergeWindows(previous.summary.windows, next.summary.windows, fromWindow),
    },
    nodes: next.nodes.map((node, nodeIndex) => ({
      ...node,
      metrics: node.metrics.map((metric, metricIndex) =>
        mergeMetric(previous.nodes[nodeIndex]?.metrics[metricIndex], metric, fromWindow),
      ),
    })),
    edges: next.edges.map((edge, edgeIndex) => ({
      ...edge,
      sentWindows: mergeWindows(previous.edges[edgeIndex]?.sentWindows, edge.sentWindows, fromWindow),
    })),
  };
}

/**
 * The window to ask the next snapshot to start from: the newest one held, which was
 * still filling when it was reported.
 */
export function nextSnapshotWindow(snapshot: RunSnapshot): number {
  return Math.max(0, snapshot.fromWindow + snapshot.summary.windows.length - 1);
}
