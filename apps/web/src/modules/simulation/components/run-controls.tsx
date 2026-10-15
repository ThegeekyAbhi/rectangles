"use client";

import { FastForwardIcon, PauseIcon, PlayIcon, StopIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRunBlocker } from "../hooks/use-run-blocker";
import { useSimulationRun } from "../hooks/use-simulation-run";
import { describeDuration } from "../lib/run-status-text";
import { RUN_DURATIONS } from "../store/run-store";
import { useRunStore } from "../store/run-store-context";

const RUN_BLOCKER_ID = "run-blocker";

/**
 * Starts a run. While the board cannot be run the button is off, and pointing at it
 * says what is missing.
 */
function RunButton({
  blocker,
  onRun,
  children,
}: {
  blocker: string | null;
  onRun: () => void;
  children: React.ReactNode;
}) {
  const button = (
    <Button
      size="sm"
      disabled={blocker !== null}
      aria-describedby={blocker === null ? undefined : RUN_BLOCKER_ID}
      onClick={onRun}
    >
      <PlayIcon weight="fill" aria-hidden />
      {children}
    </Button>
  );
  if (blocker === null) {
    return button;
  }
  return (
    <Tooltip>
      {/* A disabled button ignores the pointer, so the wrapper is what gets hovered. */}
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-not-allowed">{button}</span>
      </TooltipTrigger>
      <TooltipContent>{blocker}</TooltipContent>
      <span id={RUN_BLOCKER_ID} className="sr-only">
        {blocker}
      </span>
    </Tooltip>
  );
}

/** How long the test lasts: the stretch of time the run simulates. */
function DurationSelect({ disabled }: { disabled: boolean }) {
  const durationSeconds = useRunStore((state) => state.durationSeconds);
  const setDuration = useRunStore((state) => state.setDuration);
  return (
    <Select
      value={String(durationSeconds)}
      disabled={disabled}
      onValueChange={(value) => setDuration(Number(value))}
    >
      <SelectTrigger size="sm" aria-label="Test duration" title="How long the load test lasts">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {RUN_DURATIONS.map((seconds) => (
          <SelectItem key={seconds} value={String(seconds)}>
            {describeDuration(seconds)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Run, pause, resume, skip and stop, and the test's length. How the run is going is
 * shown in the results panel, beside the results themselves.
 */
export function RunControls() {
  const status = useRunStore((state) => state.status);
  const hasResults = useRunStore((state) => state.metrics !== null || state.failure !== null);
  const blocker = useRunBlocker();
  const { run, pause, resume, skipToEnd, stop } = useSimulationRun();
  const isRunInProgress = status === "running" || status === "paused";

  return (
    <div className="flex items-center gap-1">
      {isRunInProgress ? (
        <>
          {status === "running" ? (
            <Button variant="outline" size="sm" onClick={pause}>
              <PauseIcon weight="fill" aria-hidden />
              Pause
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={resume}>
              <PlayIcon weight="fill" aria-hidden />
              Resume
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={skipToEnd}>
            <FastForwardIcon weight="fill" aria-hidden />
            Skip to results
          </Button>
          <Button variant="outline" size="sm" onClick={stop}>
            <StopIcon weight="fill" aria-hidden />
            Stop
          </Button>
        </>
      ) : (
        <RunButton blocker={blocker} onRun={run}>
          {hasResults ? "Run again" : "Run"}
        </RunButton>
      )}
      <DurationSelect disabled={isRunInProgress} />
      <Separator orientation="vertical" className="mx-1 h-5!" />
    </div>
  );
}
