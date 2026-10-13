import type { SimulationDesign } from "@rectangles/engine";
import type { Remote } from "comlink";
import { proxy, releaseProxy, wrap } from "comlink";
import type { RunUpdate, SimulationWorkerApi } from "./simulation-worker-api";

/** The page's handle on the simulation worker. */
export interface SimulationClient {
  start(design: SimulationDesign, onUpdate: (update: RunUpdate) => void): void;
  pause(): void;
  resume(): void;
  skipToEnd(): void;
  stop(): void;
  /** Shuts the worker down. A later `start` begins a fresh one. */
  dispose(): void;
}

/**
 * Runs simulations off the main thread, so the board stays responsive during a run.
 * The worker is started on the first run, not when the board opens.
 */
export function createSimulationClient(): SimulationClient {
  let worker: Worker | null = null;
  let remote: Remote<SimulationWorkerApi> | null = null;
  // Raised on every start and on disposal, so a replaced run's late updates are dropped.
  let generation = 0;

  const connect = (): Remote<SimulationWorkerApi> => {
    if (remote === null) {
      worker = new Worker(new URL("./simulation.worker.ts", import.meta.url), { type: "module" });
      remote = wrap<SimulationWorkerApi>(worker);
    }
    return remote;
  };

  return {
    start(design, onUpdate) {
      const startedAs = ++generation;
      const forward = (update: RunUpdate) => {
        if (startedAs === generation) {
          onUpdate(update);
        }
      };
      void connect().start(design, proxy(forward));
    },
    pause() {
      void remote?.pause();
    },
    resume() {
      void remote?.resume();
    },
    skipToEnd() {
      void remote?.skipToEnd();
    },
    stop() {
      void remote?.stop();
    },
    dispose() {
      generation++;
      remote?.[releaseProxy]();
      worker?.terminate();
      remote = null;
      worker = null;
    },
  };
}
