"use client";

import { XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useSimulationRun } from "../hooks/use-simulation-run";
import { useRunStore } from "../store/run-store-context";

/** Clears the last run's results. Shown once a run is over and left something to clear. */
export function ClearResultsButton() {
  const isRunInProgress = useRunStore((state) => state.status === "running" || state.status === "paused");
  const hasResults = useRunStore((state) => state.metrics !== null || state.failure !== null);
  const { reset } = useSimulationRun();
  if (isRunInProgress || !hasResults) {
    return null;
  }
  return (
    <Button variant="ghost" size="sm" onClick={reset}>
      <XIcon aria-hidden />
      Clear results
    </Button>
  );
}
