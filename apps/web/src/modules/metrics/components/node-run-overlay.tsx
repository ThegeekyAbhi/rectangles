"use client";

import type { MetricSnapshot } from "@rectangles/engine";
import { CAPACITY_METRIC_IDS } from "@rectangles/engine";
import type { CSSProperties } from "react";
import { clamp } from "@/lib/clamp";
import { cn } from "@/lib/utils";
import { useRunStore } from "@/modules/simulation";
import { useIsRunLive } from "../hooks/use-run-reading";
import type { CapacityState } from "../lib/capacity-state";
import { capacityStateOf } from "../lib/capacity-state";
import { formatCompactNumber, formatNumber, formatPercentage, formatWholePercentage } from "../lib/format-metric";
import { currentLevel } from "../lib/window-readings";

/** Colour only marks trouble: a component with room to spare stays neutral. */
const STATE_TEXT: Record<CapacityState, string> = {
  healthy: "text-muted-foreground",
  busy: "text-state-busy",
  saturated: "text-state-saturated",
};

const BADGE = "absolute rounded-full border border-current bg-background px-1.5 text-[10px] leading-4 font-medium";

function findGaugeWindows(metrics: readonly MetricSnapshot[], metricId: string): readonly number[] | null {
  const metric = metrics.find((candidate) => candidate.id === metricId);
  return metric?.kind === "gauge" ? metric.windows : null;
}

/**
 * A component's load during and after a run, drawn on the tile itself: its border fills
 * clockwise as utilisation rises, a corner badge gives the figure, and a badge on the
 * bottom edge appears only while requests are queued. Read from the metrics the component
 * declares, never from its type, so new components get this without changes here.
 */
export function NodeRunOverlay({ nodeId }: { nodeId: string }) {
  const node = useRunStore((state) => state.metrics?.nodes.find((candidate) => candidate.id === nodeId));
  const isLive = useIsRunLive();
  const metrics = node?.metrics ?? [];
  const utilisationWindows = findGaugeWindows(metrics, CAPACITY_METRIC_IDS.utilisation);
  const queueWindows = findGaugeWindows(metrics, CAPACITY_METRIC_IDS.queueDepth);
  const utilisation = utilisationWindows === null ? null : currentLevel(utilisationWindows, isLive);
  const queueDepth = queueWindows === null ? null : currentLevel(queueWindows, isLive);
  if (utilisation === null) {
    return null;
  }
  const state = capacityStateOf(utilisation);
  const busyReading = isLive
    ? `${formatPercentage(utilisation)} busy now`
    : `Peak ${formatPercentage(utilisation)} busy`;
  const queued = queueDepth !== null && queueDepth >= 0.5 ? Math.round(queueDepth) : null;
  const queueReading =
    queued === null ? null : isLive ? `${formatNumber(queued)} queued now` : `Peak ${formatNumber(queued)} queued`;

  return (
    <div
      data-slot="node-run-overlay"
      data-capacity-state={state}
      className={cn("pointer-events-none absolute -inset-0.5 rounded-[inherit] tabular-nums", STATE_TEXT[state])}
    >
      <div
        aria-hidden
        className="load-ring absolute inset-0 rounded-[inherit]"
        style={{ "--load": clamp(utilisation, 0, 1) * 100 } as CSSProperties}
      />
      <span
        title={busyReading}
        aria-label={busyReading}
        className={cn(BADGE, "pointer-events-auto -top-2 -right-2.5")}
      >
        {formatWholePercentage(utilisation)}
      </span>
      {queueReading !== null && queued !== null && (
        <span
          title={queueReading}
          aria-label={queueReading}
          className={cn(BADGE, "pointer-events-auto -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap")}
        >
          {formatCompactNumber(queued)} queued
        </span>
      )}
    </div>
  );
}
