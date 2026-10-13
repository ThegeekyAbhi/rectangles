"use client";

import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ArrowLeftIcon,
  CornersOutIcon,
  MagnifyingGlassIcon,
  MapTrifoldIcon,
  MinusIcon,
  PlusIcon,
  SidebarSimpleIcon,
  SquareHalfBottomIcon,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useReactFlow, useStore as useFlowStore } from "@xyflow/react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ProjectSummary } from "@/modules/projects";
import { MAX_PROJECT_NAME_LENGTH, projectKeys, renameProject } from "@/modules/projects";
import type { SaveStatus as SaveStatusValue } from "../hooks/use-autosave";
import type { BoardPanelName } from "../hooks/use-board-panels";
import { useBoardPanels } from "../hooks/use-board-panels";
import { useCanvasViewStore } from "../store/canvas-view-store";
import { useWhiteboardHistory } from "../store/whiteboard-store-context";
import { SaveStatus } from "./save-status";

const ZOOM_DURATION_MS = 150;

function ToolbarButton({
  label,
  shortcut,
  ...props
}: React.ComponentProps<typeof Button> & { label: string; shortcut?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} {...props} />
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut !== undefined && <span className="ml-2 opacity-60">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

/** Shows or hides one of the panels around the canvas. Pressed while the panel is showing. */
function PanelToggle({
  panel,
  name,
  shortcut,
  children,
}: {
  panel: BoardPanelName;
  name: string;
  shortcut: string;
  children: React.ReactNode;
}) {
  const { collapsed, isInspectorEnabled, toggle } = useBoardPanels();
  // The inspector comes and goes with the selection; its button turns that on and off.
  const isShowing = panel === "inspector" ? isInspectorEnabled : !collapsed[panel];
  return (
    <ToolbarButton
      label={`${isShowing ? "Hide" : "Show"} ${name}`}
      shortcut={shortcut}
      aria-pressed={isShowing}
      className={isShowing ? undefined : "text-muted-foreground"}
      onClick={() => toggle(panel)}
    >
      {children}
    </ToolbarButton>
  );
}

/** The project's name, editable in place. Enter or leaving the field saves it. */
function ProjectName({ project }: { project: ProjectSummary }) {
  const queryClient = useQueryClient();
  const [savedName, setSavedName] = useState(project.name);
  const [name, setName] = useState(project.name);

  const commit = () => {
    if (name.trim() === "" || name.trim() === savedName) {
      setName(savedName);
      return;
    }
    void renameProject(project.id, name).then((renamed) => {
      setSavedName(renamed.name);
      setName(renamed.name);
      void queryClient.invalidateQueries({ queryKey: projectKeys.list() });
    });
  };

  return (
    <input
      value={name}
      maxLength={MAX_PROJECT_NAME_LENGTH}
      aria-label="Project name"
      className="h-7 w-56 min-w-0 truncate rounded-md border border-transparent bg-transparent px-1.5 text-sm font-medium outline-none hover:border-border focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
      onChange={(event) => setName(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          setName(savedName);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

export function WhiteboardHeader({
  project,
  saveStatus,
  onRetrySave,
  onOpenPalette,
  toolbar,
}: {
  project: ProjectSummary;
  saveStatus: SaveStatusValue;
  onRetrySave: () => void;
  onOpenPalette: () => void;
  /** Extra controls from other modules, shown before the board's own. */
  toolbar?: React.ReactNode;
}) {
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const zoomPercent = useFlowStore((state) => Math.round(state.transform[2] * 100));
  const canUndo = useWhiteboardHistory((history) => history.pastStates.length > 0);
  const canRedo = useWhiteboardHistory((history) => history.futureStates.length > 0);
  const undo = useWhiteboardHistory((history) => history.undo);
  const redo = useWhiteboardHistory((history) => history.redo);
  const isMinimapVisible = useCanvasViewStore((state) => state.isMinimapVisible);
  const toggleMinimap = useCanvasViewStore((state) => state.toggleMinimap);

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 px-2">
      <PanelToggle panel="library" name="components" shortcut="[">
        <SidebarSimpleIcon aria-hidden />
      </PanelToggle>
      <ToolbarButton label="Back to projects" asChild>
        <Link href="/">
          <ArrowLeftIcon aria-hidden />
        </Link>
      </ToolbarButton>
      <ProjectName project={project} />
      <SaveStatus status={saveStatus} onRetry={onRetrySave} />

      <div className="ml-auto flex items-center gap-1">
        {toolbar}
        <ToolbarButton label="Undo" shortcut="⌘Z" disabled={!canUndo} onClick={() => undo()}>
          <ArrowCounterClockwiseIcon aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="Redo" shortcut="⇧⌘Z" disabled={!canRedo} onClick={() => redo()}>
          <ArrowClockwiseIcon aria-hidden />
        </ToolbarButton>
        <Separator orientation="vertical" className="mx-1 h-5!" />
        <ToolbarButton
          label="Zoom out"
          shortcut="⌘−"
          onClick={() => void zoomOut({ duration: ZOOM_DURATION_MS })}
        >
          <MinusIcon aria-hidden />
        </ToolbarButton>
        <span className="w-10 text-center text-xs text-muted-foreground tabular-nums" aria-label="Zoom level">
          {zoomPercent}%
        </span>
        <ToolbarButton
          label="Zoom in"
          shortcut="⌘+"
          onClick={() => void zoomIn({ duration: ZOOM_DURATION_MS })}
        >
          <PlusIcon aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Fit to view"
          shortcut="⇧1"
          onClick={() => void fitView({ duration: ZOOM_DURATION_MS })}
        >
          <CornersOutIcon aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label={`${isMinimapVisible ? "Hide" : "Show"} minimap`}
          shortcut="M"
          aria-pressed={isMinimapVisible}
          className={isMinimapVisible ? undefined : "text-muted-foreground"}
          onClick={toggleMinimap}
        >
          <MapTrifoldIcon aria-hidden />
        </ToolbarButton>
        <Separator orientation="vertical" className="mx-1 h-5!" />
        <Button variant="outline" size="sm" onClick={onOpenPalette}>
          <MagnifyingGlassIcon aria-hidden />
          Actions
          <kbd className="ml-1 font-sans text-xs text-muted-foreground">⌘K</kbd>
        </Button>
        <ThemeToggle />
        <Separator orientation="vertical" className="mx-1 h-5!" />
        <PanelToggle panel="results" name="results" shortcut="⌘J">
          <SquareHalfBottomIcon aria-hidden />
        </PanelToggle>
        <PanelToggle panel="inspector" name="inspector" shortcut="]">
          <SidebarSimpleIcon className="-scale-x-100" aria-hidden />
        </PanelToggle>
      </div>
    </header>
  );
}
