"use client";

import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CornersOutIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  MapTrifoldIcon,
  NumberSquareOneIcon,
  SquareHalfBottomIcon,
} from "@phosphor-icons/react";
import { Panel, useReactFlow, useStore as useFlowStore } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { ANIMATED_FIT_VIEW_OPTIONS, ZOOM_DURATION_MS } from "../lib/viewport";
import { useCanvasViewStore } from "../store/canvas-view-store";
import { useWhiteboardHistory } from "../store/whiteboard-store-context";
import { PanelToggle } from "./panel-toggle";
import { ToolbarButton } from "./toolbar-button";

/** The zoom level as a button; its menu holds every way of changing the view. */
function ZoomMenu() {
  const { fitView, zoomIn, zoomOut, zoomTo } = useReactFlow();
  const zoomPercent = useFlowStore((state) => Math.round(state.transform[2] * 100));
  const isMinimapVisible = useCanvasViewStore((state) => state.isMinimapVisible);
  const toggleMinimap = useCanvasViewStore((state) => state.toggleMinimap);
  const animated = { duration: ZOOM_DURATION_MS };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Zoom, ${zoomPercent}%`} className="tabular-nums">
          {zoomPercent}%
          <CaretDownIcon aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="w-52">
        {/* Zooming in or out leaves the menu open, so it can be repeated. */}
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void zoomIn(animated);
          }}
        >
          <MagnifyingGlassPlusIcon aria-hidden />
          Zoom in
          <DropdownMenuShortcut>⌘+</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void zoomOut(animated);
          }}
        >
          <MagnifyingGlassMinusIcon aria-hidden />
          Zoom out
          <DropdownMenuShortcut>⌘−</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void fitView(ANIMATED_FIT_VIEW_OPTIONS)}>
          <CornersOutIcon aria-hidden />
          Zoom to fit
          <DropdownMenuShortcut>⇧1</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void zoomTo(1, animated)}>
          <NumberSquareOneIcon aria-hidden />
          Zoom to 100%
          <DropdownMenuShortcut>⌘0</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={isMinimapVisible} onCheckedChange={toggleMinimap}>
          <MapTrifoldIcon aria-hidden />
          Minimap
          <DropdownMenuShortcut className="mr-4">M</DropdownMenuShortcut>
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const FLOATING_BAR_CLASS =
  "flex items-center gap-0.5 rounded-lg border bg-popover p-1 text-popover-foreground shadow-sm";

/**
 * Undo, redo and the view controls, floating in the corner of the canvas. They fold
 * down to one button to leave more of the board in sight. The results toggle sits
 * beside them in its own box and stays put when they fold.
 */
export function CanvasToolbar() {
  const canUndo = useWhiteboardHistory((history) => history.pastStates.length > 0);
  const canRedo = useWhiteboardHistory((history) => history.futureStates.length > 0);
  const undo = useWhiteboardHistory((history) => history.undo);
  const redo = useWhiteboardHistory((history) => history.redo);
  const isCollapsed = useCanvasViewStore((state) => state.isCanvasToolbarCollapsed);
  const toggleCollapsed = useCanvasViewStore((state) => state.toggleCanvasToolbar);

  return (
    <Panel position="bottom-right" className="flex items-center gap-1.5">
      {/* The results open directly under this corner of the canvas. */}
      <div className={FLOATING_BAR_CLASS}>
        <PanelToggle panel="results" name="results" shortcut="⌘J">
          <SquareHalfBottomIcon aria-hidden />
        </PanelToggle>
      </div>
      <div role="toolbar" aria-label="Canvas tools" className={FLOATING_BAR_CLASS}>
        {!isCollapsed && (
          <>
            <ToolbarButton label="Undo" shortcut="⌘Z" disabled={!canUndo} onClick={() => undo()}>
              <ArrowCounterClockwiseIcon aria-hidden />
            </ToolbarButton>
            <ToolbarButton label="Redo" shortcut="⇧⌘Z" disabled={!canRedo} onClick={() => redo()}>
              <ArrowClockwiseIcon aria-hidden />
            </ToolbarButton>
            <Separator orientation="vertical" className="mx-1 h-5!" />
            <ZoomMenu />
            <Separator orientation="vertical" className="mx-1 h-5!" />
          </>
        )}
        <ToolbarButton
          label={isCollapsed ? "Show canvas tools" : "Hide canvas tools"}
          aria-expanded={!isCollapsed}
          onClick={toggleCollapsed}
        >
          {isCollapsed ? <CaretLeftIcon aria-hidden /> : <CaretRightIcon aria-hidden />}
        </ToolbarButton>
      </div>
    </Panel>
  );
}
