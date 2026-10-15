"use client";

import { WarningIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClearResultsButton, RunStatusIndicator, useIsRunStale, useRunStore } from "@/modules/simulation";
import { useWhiteboardStore } from "@/modules/whiteboard";
import { useRunTiming } from "../hooks/use-run-reading";
import { NodeMetrics } from "./node-metrics";
import { RunOverview } from "./run-overview";

/** How the run is going and the button that clears it, at the right of the panel's top row. */
function RunStatusBar() {
  return (
    <div className="ml-auto flex min-w-0 shrink items-center gap-2">
      <RunStatusIndicator />
      <ClearResultsButton />
    </div>
  );
}

function PanelMessage({ children }: { children: React.ReactNode }) {
  return <p className="p-4 text-sm text-muted-foreground">{children}</p>;
}

/**
 * The results of a run, under the canvas: the whole system's figures, and the metrics
 * of whichever component is selected on the board.
 */
export function RunPanel() {
  const status = useRunStore((state) => state.status);
  const metrics = useRunStore((state) => state.metrics);
  const result = useRunStore((state) => state.result);
  const failure = useRunStore((state) => state.failure);
  const timing = useRunTiming();
  const isStale = useIsRunStale();
  const selected = useWhiteboardStore(
    useShallow((state) => {
      const nodes = state.nodes.filter((node) => node.selected);
      const [only] = nodes;
      return nodes.length === 1 && only !== undefined ? { id: only.id, label: only.data.label } : null;
    }),
  );
  const [tab, setTab] = useState("overview");

  if (metrics === null || timing === null) {
    if (status === "idle") {
      return (
        <section aria-label="Run results" className="h-full bg-background">
          <p className="px-4 py-3 text-xs text-muted-foreground">
            Nothing has run yet. Press Run to send simulated traffic through this board.
          </p>
        </section>
      );
    }
    return (
      <section aria-label="Run results" className="h-full bg-background">
        <div className="flex h-10 shrink-0 items-center gap-3 border-b px-4">
          <RunStatusBar />
        </div>
        <p className="px-4 py-3 text-xs text-muted-foreground" role={status === "failed" ? "alert" : undefined}>
          {status === "failed"
            ? `The run failed: ${failure ?? "unknown error"}`
            : "Starting the run…"}
        </p>
      </section>
    );
  }

  const selectedNode = selected === null ? undefined : metrics.nodes.find((node) => node.id === selected.id);
  const isPartial = result?.stopReason === "event-limit" || result?.stopReason === "time-limit";

  return (
    <section aria-label="Run results" className="h-full bg-background">
      <Tabs value={tab} onValueChange={setTab} className="h-full gap-0">
        <div className="flex h-10 shrink-0 items-center gap-3 border-b px-2">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="component">{selected === null ? "Component" : selected.label}</TabsTrigger>
          </TabsList>
          {isStale && (
            <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground" role="status">
              <WarningIcon className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">These results are from before your last change. Run again to update them.</span>
            </p>
          )}
          {!isStale && isPartial && (
            <p className="min-w-0 truncate text-xs text-muted-foreground">
              The results cover the run up to the point it stopped.
            </p>
          )}
          <RunStatusBar />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <TabsContent value="overview">
            <RunOverview metrics={metrics} timing={timing} />
          </TabsContent>
          <TabsContent value="component">
            {selected === null ? (
              <PanelMessage>Select one component on the board to see its metrics.</PanelMessage>
            ) : selectedNode === undefined ? (
              <PanelMessage>“{selected.label}” was added after this run. Run again to see its metrics.</PanelMessage>
            ) : (
              <NodeMetrics key={selectedNode.id} node={selectedNode} timing={timing} />
            )}
          </TabsContent>
        </div>
      </Tabs>
    </section>
  );
}
