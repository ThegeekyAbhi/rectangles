"use client";

import { InspectorPanel } from "@/modules/inspector";
import { EdgeFlowLabel, NodeRunOverlay, RunPanel } from "@/modules/metrics";
import { RunControls, RunStoreProvider } from "@/modules/simulation";
import { Whiteboard } from "@/modules/whiteboard";

/** One project's board with everything that plugs into it: settings, runs and metrics. */
export function ProjectWorkspace({ projectId }: { projectId: string }) {
  return (
    <RunStoreProvider key={projectId}>
      <Whiteboard
        projectId={projectId}
        inspector={<InspectorPanel />}
        toolbar={<RunControls />}
        panel={<RunPanel />}
        nodeOverlay={NodeRunOverlay}
        edgeLabel={EdgeFlowLabel}
      />
    </RunStoreProvider>
  );
}
