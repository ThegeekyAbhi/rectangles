"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useStore } from "zustand";
import type { SimulationClient } from "../worker/simulation-client";
import { createSimulationClient } from "../worker/simulation-client";
import type { RunState, RunStore } from "./run-store";
import { createRunStore } from "./run-store";

interface RunContextValue {
  readonly store: RunStore;
  readonly client: SimulationClient;
}

const RunContext = createContext<RunContextValue | null>(null);

/**
 * Creates the run store and the simulation worker's client for one open board, and
 * shuts the worker down when the board closes.
 */
export function RunStoreProvider({ children }: { children: React.ReactNode }) {
  const [value] = useState<RunContextValue>(() => ({
    store: createRunStore(),
    client: createSimulationClient(),
  }));
  useEffect(() => () => value.client.dispose(), [value]);
  return <RunContext value={value}>{children}</RunContext>;
}

/** The run store and worker client, for reading state inside event handlers. */
export function useRunContext(): RunContextValue {
  const value = useContext(RunContext);
  if (value === null) {
    throw new Error("useRunContext must be used inside a RunStoreProvider.");
  }
  return value;
}

export function useRunStore<Selected>(selector: (state: RunState) => Selected): Selected {
  return useStore(useRunContext().store, selector);
}
