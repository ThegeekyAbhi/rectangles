"use client";

import { useRunStore } from "@/modules/simulation";
import { useRunTiming } from "../hooks/use-run-reading";
import { formatNumber } from "../lib/format-metric";
import { currentRate } from "../lib/window-readings";

/** How many calls per second travel along a connection, counted by the engine. */
export function EdgeFlowLabel({ edgeId }: { edgeId: string }) {
  const edge = useRunStore((state) => state.metrics?.edges.find((candidate) => candidate.id === edgeId));
  const timing = useRunTiming();
  if (edge === undefined || timing === null) {
    return null;
  }
  const rate = currentRate({ windows: edge.sentWindows, total: edge.calls.sent, ...timing });
  if (rate === null) {
    return null;
  }
  return (
    <span
      data-slot="edge-flow-label"
      title="Calls sent along this connection per second"
      className="rounded-sm border border-node-border bg-background px-1 py-px text-[11px] leading-4 text-muted-foreground tabular-nums"
    >
      {formatNumber(rate)}/s
    </span>
  );
}
