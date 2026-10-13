import type { RunResult, RunSnapshot, SimulationDesign } from "@rectangles/engine";

/** What the worker reports while a run is going. */
export type RunUpdate =
  /** Progress. Holds only the windows since the previous snapshot. */
  | { readonly kind: "snapshot"; readonly snapshot: RunSnapshot }
  /** The run ended or was stopped. A stopped run's result has no stop reason. */
  | { readonly kind: "finished"; readonly result: RunResult }
  | { readonly kind: "failed"; readonly message: string };

/** The calls the page can make into the simulation worker. */
export interface SimulationWorkerApi {
  /** Starts a run, replacing any run in progress. Updates arrive through `onUpdate`. */
  start(design: SimulationDesign, onUpdate: (update: RunUpdate) => void): void;
  pause(): void;
  resume(): void;
  /** Stops pacing the run for watching and finishes it as fast as possible. */
  skipToEnd(): void;
  /** Ends the run early and reports the results so far as `finished`. */
  stop(): void;
}
