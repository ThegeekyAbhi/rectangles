import { useMemo } from "react";
import { elementsToDocument, useBoardPanels, useWhiteboardStoreApi } from "@/modules/whiteboard";
import { documentToDesign } from "../lib/document-to-design";
import { useRunContext } from "../store/run-store-context";

export interface SimulationRunActions {
  /** Runs the board as it is now, for the chosen duration. */
  run(): void;
  pause(): void;
  resume(): void;
  /** Stops playing the run back at watching speed and goes straight to its results. */
  skipToEnd(): void;
  /** Ends the run early and keeps the results so far. */
  stop(): void;
  /** Ends any run and clears the results. */
  reset(): void;
}

/** The actions that drive a simulation run of the open board. */
export function useSimulationRun(): SimulationRunActions {
  const { store, client } = useRunContext();
  const whiteboard = useWhiteboardStoreApi();
  const { show } = useBoardPanels();

  return useMemo(
    () => ({
      run() {
        const { nodes, edges } = whiteboard.getState();
        const { durationSeconds, begin } = store.getState();
        const design = documentToDesign(elementsToDocument(nodes, edges), durationSeconds);
        begin({ nodes, edges });
        show("results");
        client.start(design, (update) => {
          store.getState().receive(update);
        });
      },
      pause() {
        client.pause();
        store.getState().setPaused(true);
      },
      resume() {
        client.resume();
        store.getState().setPaused(false);
      },
      skipToEnd() {
        client.skipToEnd();
        store.getState().setPaused(false);
      },
      stop() {
        client.stop();
      },
      reset() {
        client.stop();
        store.getState().reset();
      },
    }),
    [client, show, store, whiteboard],
  );
}
