"use client";

import { FastForwardIcon, PauseIcon, PlayIcon, StopIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useRunBlocker } from "../hooks/use-run-blocker";
import { useSimulationRun } from "../hooks/use-simulation-run";
import { describeDuration, describeRunEnd, formatSimulatedSeconds } from "../lib/run-status-text";
import { RUN_DURATIONS } from "../store/run-store";
import { useRunStore } from "../store/run-store-context";

/** What the run is doing right now, or why it cannot start. */
function RunStatusText({ blocker }: { blocker: string | null }) {
  const status = useRunStore((state) => state.status);
  const simulatedSeconds = useRunStore((state) => state.metrics?.simulatedSeconds ?? 0);
  const durationSeconds = useRunStore((state) => state.durationSeconds);
  const result = useRunStore((state) => state.result);
  const failure = useRunStore((state) => state.failure);

  let text: string | null = blocker;
  let isProblem = false;
  if (status === "running" || status === "paused") {
    const progress = `${formatSimulatedSeconds(simulatedSeconds)} of ${formatSimulatedSeconds(durationSeconds)}`;
    text = status === "paused" ? `Paused · ${progress}` : progress;
  } else if (status === "failed") {
    text = `Run failed: ${failure ?? "unknown error"}`;
    isProblem = true;
  } else if (blocker === null && result !== null) {
    text = describeRunEnd(result);
  }
  if (text === null) {
    return null;
  }
  return (
    <span
      role="status"
      aria-label="Run status"
      title={text}
      className={`max-w-80 truncate text-xs tabular-nums ${isProblem ? "text-destructive" : "text-muted-foreground"}`}
    >
      {text}
    </span>
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

/** Run, pause, resume, skip, stop and clear, with the run's status beside them. */
export function RunControls() {
  const status = useRunStore((state) => state.status);
  const hasResults = useRunStore((state) => state.metrics !== null || state.failure !== null);
  const blocker = useRunBlocker();
  const { run, pause, resume, skipToEnd, stop, reset } = useSimulationRun();
  const isRunInProgress = status === "running" || status === "paused";

  return (
    <div className="flex items-center gap-1">
      <RunStatusText blocker={blocker} />
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
        <>
          <Button size="sm" disabled={blocker !== null} onClick={run}>
            <PlayIcon weight="fill" aria-hidden />
            {hasResults ? "Run again" : "Run"}
          </Button>
          {hasResults && (
            <Button variant="ghost" size="sm" onClick={reset}>
              <XIcon aria-hidden />
              Clear results
            </Button>
          )}
        </>
      )}
      <DurationSelect disabled={isRunInProgress} />
      <Separator orientation="vertical" className="mx-1 h-5!" />
    </div>
  );
}
