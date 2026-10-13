import type { RunResult, RunSnapshot } from "@rectangles/engine";
import { createStore } from "zustand/vanilla";
import type { BoardElements } from "@/modules/whiteboard";
import { mergeSnapshot } from "../lib/merge-snapshot";
import type { RunUpdate } from "../worker/simulation-worker-api";

/**
 * - `idle`: nothing has run, or the results were cleared.
 * - `running` / `paused`: a run is in progress.
 * - `finished`: the run reached its end or was stopped; its results are shown.
 * - `failed`: the run could not start or broke part-way.
 */
export type RunStatus = "idle" | "running" | "paused" | "finished" | "failed";

/** The lengths of test on offer, in simulated seconds. */
export const RUN_DURATIONS = [30, 60, 120, 300, 600] as const;
export const DEFAULT_RUN_DURATION = 60;

export interface RunState {
  readonly status: RunStatus;
  /** How much time the next run simulates, in seconds. */
  readonly durationSeconds: number;
  /** Metrics of the current or latest run, holding every window so far. */
  readonly metrics: RunSnapshot | null;
  /** The finished run, with whole-run percentiles. `null` until a run ends. */
  readonly result: RunResult | null;
  /** Why the run failed, when it did. */
  readonly failure: string | null;
  /** The board as it was when the current or latest run started. */
  readonly ranElements: BoardElements | null;
  setDuration(durationSeconds: number): void;
  /** Marks a run of the given board as started, clearing earlier results. */
  begin(elements: BoardElements): void;
  /** Takes in what the worker reports. Reports that arrive after a reset are ignored. */
  receive(update: RunUpdate): void;
  setPaused(isPaused: boolean): void;
  /** Clears the results and returns to `idle`. The duration is kept. */
  reset(): void;
}

/** Creates the store behind one open board's simulation runs. */
export function createRunStore() {
  return createStore<RunState>()((set, get) => ({
    status: "idle",
    durationSeconds: DEFAULT_RUN_DURATION,
    metrics: null,
    result: null,
    failure: null,
    ranElements: null,

    setDuration(durationSeconds) {
      set({ durationSeconds });
    },

    begin(elements) {
      set({ status: "running", metrics: null, result: null, failure: null, ranElements: elements });
    },

    receive(update) {
      const { status, metrics } = get();
      if (status !== "running" && status !== "paused") {
        return;
      }
      if (update.kind === "snapshot") {
        set({ metrics: mergeSnapshot(metrics, update.snapshot) });
      } else if (update.kind === "finished") {
        // A result holds everything a snapshot does, from the first window.
        set({
          status: "finished",
          result: update.result,
          metrics: { ...update.result, fromWindow: 0 },
        });
      } else {
        set({ status: "failed", failure: update.message });
      }
    },

    setPaused(isPaused) {
      const { status } = get();
      if (isPaused && status === "running") {
        set({ status: "paused" });
      } else if (!isPaused && status === "paused") {
        set({ status: "running" });
      }
    },

    reset() {
      set({ status: "idle", metrics: null, result: null, failure: null, ranElements: null });
    },
  }));
}

export type RunStore = ReturnType<typeof createRunStore>;
