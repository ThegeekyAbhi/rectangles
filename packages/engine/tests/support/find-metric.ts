import type { MetricResult, RunResult, SampleResult } from "../../src/metrics/run-result.ts";
import type { CounterResult, GaugeResult } from "../../src/metrics/run-snapshot.ts";

function findMetric<Kind extends MetricResult["kind"]>(
  result: RunResult,
  nodeId: string,
  metricId: string,
  kind: Kind,
): Extract<MetricResult, { kind: Kind }> {
  const metric = result.nodes
    .find((node) => node.id === nodeId)
    ?.metrics.find((candidate) => candidate.id === metricId);
  if (metric?.kind !== kind) {
    throw new Error(`Node "${nodeId}" has no ${kind} metric "${metricId}".`);
  }
  return metric as Extract<MetricResult, { kind: Kind }>;
}

export function findCounter(result: RunResult, nodeId: string, metricId: string): CounterResult {
  return findMetric(result, nodeId, metricId, "counter");
}

export function findGauge(result: RunResult, nodeId: string, metricId: string): GaugeResult {
  return findMetric(result, nodeId, metricId, "gauge");
}

export function findSample(result: RunResult, nodeId: string, metricId: string): SampleResult {
  return findMetric(result, nodeId, metricId, "sample");
}
