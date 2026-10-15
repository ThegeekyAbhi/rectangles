"use client";

import type { MetricResult, MetricSnapshot, NodeSnapshot } from "@rectangles/engine";
import { useMemo } from "react";
import { useRunStore } from "@/modules/simulation";
import { findComponentDefinition } from "@/modules/whiteboard";
import { InfoTip } from "@/components/info-tip";
import type { RunTiming } from "../hooks/use-run-reading";
import { metricChart } from "../lib/chart-series";
import { describeMetric } from "../lib/describe-metric";
import { MetricChart } from "./metric-chart";

function MetricCard({
  metric,
  finished,
  definition,
  timing,
}: {
  metric: MetricSnapshot;
  finished: MetricResult | undefined;
  definition: string | undefined;
  timing: RunTiming;
}) {
  const { windowSeconds, isLive } = timing;
  const chart = useMemo(() => metricChart(metric, windowSeconds, isLive), [metric, windowSeconds, isLive]);
  return (
    <div className="min-w-0 rounded-lg border p-3" data-slot="node-metric" data-metric={metric.id}>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-xs">{metric.id}</span>
        {definition !== undefined && <InfoTip label={`What ${metric.id} means`}>{definition}</InfoTip>}
      </div>
      <div className="mt-0.5 mb-2 truncate text-xs text-muted-foreground tabular-nums">
        {describeMetric(metric, finished, timing)}
      </div>
      <MetricChart chart={chart} label={`${metric.id} over the run`} height={84} />
    </div>
  );
}

/** Every metric one component declares, each with its figures, chart and definition. */
export function NodeMetrics({ node, timing }: { node: NodeSnapshot; timing: RunTiming }) {
  const finishedNode = useRunStore((state) => state.result?.nodes.find((candidate) => candidate.id === node.id));
  const definitions = findComponentDefinition(node.type)?.metrics ?? [];

  return (
    <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
      {node.metrics.map((metric, index) => (
        <MetricCard
          key={metric.id}
          metric={metric}
          finished={finishedNode?.metrics[index]}
          definition={definitions.find((spec) => spec.id === metric.id)?.definition}
          timing={timing}
        />
      ))}
    </div>
  );
}
