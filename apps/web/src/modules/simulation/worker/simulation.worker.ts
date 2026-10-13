import type { Simulation } from "@rectangles/engine";
import { createSimulation, registry } from "@rectangles/engine";
import { expose } from "comlink";
import { nextSnapshotWindow } from "../lib/merge-snapshot";
import { simulatedMicrosFor, TICK_MS } from "../lib/playback";
import type { RunUpdate, SimulationWorkerApi } from "./simulation-worker-api";

/** At full speed, how much simulated time to process between looks at the clock. */
const FULL_SPEED_SLICE_MICROS = 50_000;

interface ActiveRun {
  readonly simulation: Simulation;
  readonly durationSeconds: number;
  readonly onUpdate: (update: RunUpdate) => void;
  /** The first window the next snapshot needs to report. */
  snapshotWindow: number;
  lastTickAtMs: number;
  isPaused: boolean;
  /** Set by "skip to results": no longer paced for watching. */
  isAtFullSpeed: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
}

let activeRun: ActiveRun | null = null;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function endRun(run: ActiveRun, update: RunUpdate): void {
  clearTimeout(run.timer);
  if (activeRun === run) {
    activeRun = null;
  }
  run.onUpdate(update);
}

/** Advances the run by one tick's worth of simulated time. Returns `true` at the end. */
function advance(run: ActiveRun): boolean {
  const { simulation } = run;
  const nowMs = performance.now();
  if (run.isAtFullSpeed) {
    const deadlineMs = nowMs + TICK_MS;
    let isFinished = false;
    while (!isFinished && performance.now() < deadlineMs) {
      isFinished = simulation.step(simulation.nowMicros + FULL_SPEED_SLICE_MICROS);
    }
    return isFinished;
  }
  const elapsedMs = nowMs - run.lastTickAtMs;
  run.lastTickAtMs = nowMs;
  return simulation.step(simulation.nowMicros + simulatedMicrosFor(run.durationSeconds, elapsedMs));
}

/**
 * One turn of the run: advance, report, and wait. Waiting hands control back to the
 * worker's message loop, which is what lets pause and stop arrive mid-run.
 */
function tick(run: ActiveRun): void {
  if (activeRun !== run || run.isPaused) {
    return;
  }
  try {
    if (advance(run)) {
      endRun(run, { kind: "finished", result: run.simulation.result() });
      return;
    }
    const snapshot = run.simulation.snapshot(run.snapshotWindow);
    run.snapshotWindow = nextSnapshotWindow(snapshot);
    run.onUpdate({ kind: "snapshot", snapshot });
  } catch (error) {
    endRun(run, { kind: "failed", message: describeError(error) });
    return;
  }
  run.timer = setTimeout(() => {
    tick(run);
  }, run.isAtFullSpeed ? 0 : TICK_MS);
}

const api: SimulationWorkerApi = {
  start(design, onUpdate) {
    if (activeRun !== null) {
      clearTimeout(activeRun.timer);
      activeRun = null;
    }
    let simulation: Simulation;
    try {
      simulation = createSimulation(design, { registry });
    } catch (error) {
      onUpdate({ kind: "failed", message: describeError(error) });
      return;
    }
    const run: ActiveRun = {
      simulation,
      durationSeconds: design.run.durationSeconds,
      onUpdate,
      snapshotWindow: 0,
      lastTickAtMs: performance.now(),
      isPaused: false,
      isAtFullSpeed: false,
      timer: undefined,
    };
    activeRun = run;
    run.timer = setTimeout(() => {
      tick(run);
    }, 0);
  },

  pause() {
    if (activeRun !== null) {
      activeRun.isPaused = true;
      clearTimeout(activeRun.timer);
    }
  },

  resume() {
    const run = activeRun;
    if (run?.isPaused === true) {
      run.isPaused = false;
      run.lastTickAtMs = performance.now();
      tick(run);
    }
  },

  skipToEnd() {
    const run = activeRun;
    if (run !== null) {
      run.isAtFullSpeed = true;
      run.isPaused = false;
      clearTimeout(run.timer);
      tick(run);
    }
  },

  stop() {
    if (activeRun !== null) {
      endRun(activeRun, { kind: "finished", result: activeRun.simulation.result() });
    }
  },
};

expose(api);
