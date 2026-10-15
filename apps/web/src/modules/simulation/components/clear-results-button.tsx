"use client";

import { XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useSimulationRun } from "../hooks/use-simulation-run";
import { hasRunResults, isRunInProgress } from "../store/run-store";
import { useRunStore } from "../store/run-store-context";

/** Clears the last run's results. Shown once a run is over and left something to clear. */
export function ClearResultsButton() {
  const isInProgress = useRunStore((state) => isRunInProgress(state.status));
  const hasResults = useRunStore(hasRunResults);
  const { reset } = useSimulationRun();
  if (isInProgress || !hasResults) {
    return null;
  }
  return (
    <Button variant="ghost" size="sm" onClick={reset}>
      <XIcon aria-hidden />
      Clear results
    </Button>
  );
}
