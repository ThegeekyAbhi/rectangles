"use client";

import type { MetricSnapshot } from "@rectangles/engine";
import { CAPACITY_METRIC_IDS } from "@rectangles/engine";
import { clamp } from "@/lib/clamp";
import { useRunStore } from "@/modules/simulation";
import { useIsRunLive } from "../hooks/use-run-reading";
import type { CapacityState } from "../lib/capacity-state";
import { capacityStateOf } from "../lib/capacity-state";
import { formatNumber, formatPercentage } from "../lib/format-metric";
import { currentLevel } from "../lib/window-readings";

const STATE_TEXT: Record<CapacityState, string> = {
  healthy: "text-state-healthy",
  busy: "text-state-busy",
  saturated: "text-state-saturated",
};

const RING_RADIUS = 5;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** A small ring that fills as utilisation rises. */
function UtilisationRing({ utilisation }: { utilisation: number }) {
  const filled = clamp(utilisation, 0, 1) * RING_LENGTH;
  return (
    <svg viewBox="0 0 14 14" className="size-3.5 -rotate-90" aria-hidden>
      <circle cx="7" cy="7" r={RING_RADIUS} fill="none" strokeWidth="2.5" className="stroke-border" />
      <circle
        cx="7"
        cy="7"
        r={RING_RADIUS}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        stroke="currentColor"
        strokeDasharray={`${filled} ${RING_LENGTH}`}
      />
    </svg>
  );
}

function findGaugeWindows(metrics: readonly MetricSnapshot[], metricId: string): readonly number[] | null {
  const metric = metrics.find((candidate) => candidate.id === metricId);
  return metric?.kind === "gauge" ? metric.windows : null;
}

/**
 * A component's load during and after a run: how full it is and how much is queued.
 * Read from the metrics the component declares, never from its type, so new
 * components get this without changes here.
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
  const prefix = isLive ? "" : "peak ";

  return (
    <>
      {state === "saturated" && (
        <div className="pointer-events-none absolute -inset-0.5 rounded-[inherit] ring-2 ring-state-saturated" />
      )}
      <div
        data-slot="node-run-overlay"
        data-capacity-state={state}
        className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 flex -translate-x-1/2 items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground tabular-nums"
      >
        <span className={`flex items-center gap-1 font-medium ${STATE_TEXT[state]}`}>
          <UtilisationRing utilisation={utilisation} />
          {prefix}
          {formatPercentage(utilisation)} busy
        </span>
        {queueDepth !== null && queueDepth >= 0.5 && (
          <span>
            · {prefix}
            {formatNumber(Math.round(queueDepth))} queued
          </span>
        )}
      </div>
    </>
  );
}
