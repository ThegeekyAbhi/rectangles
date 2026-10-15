"use client";

import { SidebarSimpleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import type { ProjectDocument } from "@rectangles/schema";
import { ReactFlowProvider } from "@xyflow/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ProjectSummary } from "@/modules/projects";
import { useLoadedProject } from "@/modules/projects";
import { useAutosave } from "../hooks/use-autosave";
import { useBoardPanels } from "../hooks/use-board-panels";
import { useWhiteboardShortcuts } from "../hooks/use-whiteboard-shortcuts";
import { documentToElements } from "../lib/document-conversion";
import { WhiteboardStoreProvider } from "../store/whiteboard-store-context";
import { BoardPanels, BoardPanelsProvider } from "./board-panels";
import type { CanvasSlots } from "./canvas-slots";
import { CanvasSlotsProvider } from "./canvas-slots";
import { CommandPalette } from "./command-palette";
import { ComponentLibrary } from "./component-library";
import { ToolbarButton } from "./toolbar-button";
import { WhiteboardCanvas } from "./whiteboard-canvas";
import { WhiteboardHeader } from "./whiteboard-header";

/** Shown while the route and the project are loading; mirrors the board's layout. */
export function WhiteboardSkeleton() {
  return (
    <div className="flex h-dvh flex-col bg-sidebar" aria-busy aria-label="Loading board">
      <div className="h-12 shrink-0" />
      <div className="flex min-h-0 flex-1 gap-2 px-2 pb-2">
        <div className="w-60 shrink-0" />
        <div className="flex-1 animate-pulse rounded-xl border bg-background" />
      </div>
    </div>
  );
}

function BoardMessage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center px-6 text-center" role="alert">
      <WarningCircleIcon weight="duotone" className="size-8 text-muted-foreground" aria-hidden />
      <h1 className="mt-4 text-sm font-medium">{title}</h1>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{children}</p>
      <Button asChild size="sm" variant="outline" className="mt-6">
        <Link href="/">Back to projects</Link>
      </Button>
    </div>
  );
}

/** What other modules add to the board. The page passes these in, so this module depends on none of them. */
interface WhiteboardSlots {
  inspector: React.ReactNode;
  /** Extra controls for the header. */
  toolbar?: React.ReactNode;
  /** A panel under the canvas, hidden until something shows it. */
  panel?: React.ReactNode;
  nodeOverlay?: CanvasSlots["NodeOverlay"];
  edgeLabel?: CanvasSlots["EdgeLabel"];
}

function Workspace({ project, slots }: { project: ProjectSummary; slots: WhiteboardSlots }) {
  const { inspector, toolbar, panel, nodeOverlay, edgeLabel } = slots;
  const canvasSlots = useMemo<CanvasSlots>(
    () => ({ NodeOverlay: nodeOverlay, EdgeLabel: edgeLabel }),
    [nodeOverlay, edgeLabel],
  );
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const autosave = useAutosave(project.id);
  const { toggle } = useBoardPanels();
  useWhiteboardShortcuts({ onOpenPalette: () => setIsPaletteOpen(true) });

  return (
    <div className="flex h-dvh flex-col bg-sidebar">
      <WhiteboardHeader
        project={project}
        saveStatus={autosave.status}
        onRetrySave={autosave.retry}
        onOpenPalette={() => setIsPaletteOpen(true)}
        toolbar={toolbar}
      />
      <BoardPanels
        library={<ComponentLibrary />}
        canvas={
          <main className="relative size-full" aria-label="Board">
            <CanvasSlotsProvider value={canvasSlots}>
              <WhiteboardCanvas />
            </CanvasSlotsProvider>
          </main>
        }
        results={panel}
        inspector={
          <aside className="relative h-full overflow-y-auto" aria-label="Inspector">
            {/* Once hidden, a double-click on the board or the ] key brings it back. */}
            <ToolbarButton
              label="Hide inspector"
              shortcut="]"
              className="absolute top-2 right-2 z-10 text-muted-foreground"
              onClick={() => toggle("inspector")}
            >
              <SidebarSimpleIcon className="-scale-x-100" aria-hidden />
            </ToolbarButton>
            {inspector}
          </aside>
        }
      />
      <CommandPalette isOpen={isPaletteOpen} onOpenChange={setIsPaletteOpen} />
    </div>
  );
}

function Board({
  project,
  document,
  slots,
}: {
  project: ProjectSummary;
  document: ProjectDocument;
  slots: WhiteboardSlots;
}) {
  // Converted once: after loading, the store owns the board and the document is derived.
  const [initialElements] = useState(() => documentToElements(document));
  return (
    <ReactFlowProvider>
      <WhiteboardStoreProvider initialElements={initialElements}>
        <BoardPanelsProvider>
          <Workspace project={project} slots={slots} />
        </BoardPanelsProvider>
      </WhiteboardStoreProvider>
    </ReactFlowProvider>
  );
}

/**
 * One project's board: component library, canvas and inspector. The inspector and
 * everything to do with running the board are passed in by the page, so this module
 * does not depend on the modules that provide them.
 */
export function Whiteboard({ projectId, ...slots }: { projectId: string } & WhiteboardSlots) {
  const loaded = useLoadedProject(projectId);

  if (loaded.isPending) {
    return <WhiteboardSkeleton />;
  }
  if (loaded.isError) {
    return (
      <BoardMessage title="Couldn't open this project">
        Projects are stored in this browser. Check that site data is allowed, then try again.
      </BoardMessage>
    );
  }
  if (loaded.data.status === "not-found") {
    return (
      <BoardMessage title="Project not found">
        It may have been deleted, or it was created in a different browser.
      </BoardMessage>
    );
  }
  if (loaded.data.status === "damaged") {
    return (
      <BoardMessage title={`“${loaded.data.project.name}” can't be opened`}>
        {loaded.data.message}
      </BoardMessage>
    );
  }
  return (
    <Board
      key={projectId}
      project={loaded.data.project}
      document={loaded.data.document}
      slots={slots}
    />
  );
}
