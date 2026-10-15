import { isRunInProgress, useRunStore } from "@/modules/simulation";
import type { RunTiming } from "../lib/window-readings";

export function useIsRunLive(): boolean {
  return useRunStore((state) => isRunInProgress(state.status));
}

/** The run's timing, or `null` when there are no metrics to read. */
export function useRunTiming(): RunTiming | null {
  const windowSeconds = useRunStore((state) => state.metrics?.windowSeconds);
  const simulatedSeconds = useRunStore((state) => state.metrics?.simulatedSeconds);
  const isLive = useIsRunLive();
  return windowSeconds === undefined || simulatedSeconds === undefined
    ? null
    : { windowSeconds, simulatedSeconds, isLive };
}
