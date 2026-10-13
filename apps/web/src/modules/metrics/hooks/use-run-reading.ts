import { useRunStore } from "@/modules/simulation";

/** The timing a reading needs: window length, run length so far, and whether it is live. */
export interface RunTiming {
  readonly windowSeconds: number;
  readonly simulatedSeconds: number;
  /** `true` while the run is in progress, so the newest window is still filling. */
  readonly isLive: boolean;
}

export function useIsRunLive(): boolean {
  return useRunStore((state) => state.status === "running" || state.status === "paused");
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
