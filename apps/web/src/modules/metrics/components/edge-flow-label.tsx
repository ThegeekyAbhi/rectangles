"use client";

import { useRunStore } from "@/modules/simulation";
import { useRunTiming } from "../hooks/use-run-reading";
import { formatCompactNumber, formatNumber } from "../lib/format-metric";
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
      title={`${formatNumber(rate)} calls sent along this connection per second`}
      className="rounded-sm bg-background px-1 text-[11px] leading-4 text-muted-foreground tabular-nums"
    >
      {formatCompactNumber(rate)}/s
    </span>
  );
}
