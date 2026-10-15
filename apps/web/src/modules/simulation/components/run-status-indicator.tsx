"use client";

import type { Icon } from "@phosphor-icons/react";
import { CheckCircleIcon, PauseCircleIcon, StopCircleIcon, WarningCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import { clamp } from "@/lib/clamp";
import { cn } from "@/lib/utils";
import { describeRunEnd, formatSimulatedSeconds } from "../lib/run-status-text";
import { isRunInProgress } from "../store/run-store";
import { useRunStore } from "../store/run-store-context";

/** How far through the run the simulation is, as a thin bar. */
function RunProgress({ fraction }: { fraction: number }) {
  return (
    <span className="h-1 w-20 overflow-hidden rounded-full bg-muted" aria-hidden>
      <span
        className="block h-full rounded-full bg-foreground transition-[width] duration-200"
        style={{ width: `${clamp(fraction, 0, 1) * 100}%` }}
      />
    </span>
  );
}

/**
 * What the run is doing right now, or how the last one ended: progress while it plays,
 * and an outcome marked by its icon once it is over.
 */
export function RunStatusIndicator() {
  const status = useRunStore((state) => state.status);
  const simulatedSeconds = useRunStore((state) => state.metrics?.simulatedSeconds ?? 0);
  const durationSeconds = useRunStore((state) => state.durationSeconds);
  const result = useRunStore((state) => state.result);
  const failure = useRunStore((state) => state.failure);

  let text: string;
  let StatusIcon: Icon | null = null;
  let iconClass = "text-muted-foreground";
  const isInProgress = isRunInProgress(status);
  if (isInProgress) {
    const progress = `${formatSimulatedSeconds(simulatedSeconds)} of ${formatSimulatedSeconds(durationSeconds)}`;
    text = status === "paused" ? `Paused · ${progress}` : progress;
    StatusIcon = status === "paused" ? PauseCircleIcon : null;
  } else if (status === "failed") {
    text = `Run failed: ${failure ?? "unknown error"}`;
    StatusIcon = XCircleIcon;
    iconClass = "text-destructive";
  } else if (result !== null) {
    text = describeRunEnd(result);
    if (result.stopReason === "completed") {
      StatusIcon = CheckCircleIcon;
      iconClass = "text-state-healthy";
    } else if (result.stopReason === null) {
      StatusIcon = StopCircleIcon;
    } else {
      StatusIcon = WarningCircleIcon;
      iconClass = "text-state-busy";
    }
  } else {
    return null;
  }

  return (
    <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground tabular-nums">
      {isInProgress && <RunProgress fraction={simulatedSeconds / durationSeconds} />}
      {StatusIcon !== null && <StatusIcon weight="fill" className={cn("size-4 shrink-0", iconClass)} aria-hidden />}
      <span role="status" aria-label="Run status" title={text} className="truncate">
        {text}
      </span>
    </span>
  );
}
