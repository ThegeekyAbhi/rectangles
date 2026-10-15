"use client";

import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ArrowLeftIcon,
  CopyIcon,
  CircleHalfIcon,
  CornersOutIcon,
  FileCodeIcon,
  MapTrifoldIcon,
  SelectionAllIcon,
  SidebarSimpleIcon,
  SquareHalfBottomIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useReactFlow } from "@xyflow/react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { THEMES } from "@/components/theme-toggle";
import { useAddComponent } from "../hooks/use-add-component";
import { useBoardPanels } from "../hooks/use-board-panels";
import { listComponentDefinitions } from "../lib/component-catalog";
import { elementsToDocument } from "../lib/document-conversion";
import { ANIMATED_FIT_VIEW_OPTIONS } from "../lib/viewport";
import { useCanvasViewStore } from "../store/canvas-view-store";
import { useWhiteboardStoreApi } from "../store/whiteboard-store-context";
import { ComponentIconChip } from "./component-icon-chip";

export function CommandPalette({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const router = useRouter();
  const store = useWhiteboardStoreApi();
  const addComponent = useAddComponent();
  const { fitView } = useReactFlow();
  const { collapsed, toggle } = useBoardPanels();
  const isInspectorEnabled = useCanvasViewStore((state) => state.isInspectorEnabled);
  const { setTheme } = useTheme();
  const isMinimapVisible = useCanvasViewStore((state) => state.isMinimapVisible);
  const toggleMinimap = useCanvasViewStore((state) => state.toggleMinimap);

  const run = (action: () => void) => () => {
    onOpenChange(false);
    action();
  };

  /** The board as a saved document, for pasting into a lesson as a read-only diagram. */
  const copyDiagramJson = () => {
    const { nodes, edges } = store.getState();
    const json = JSON.stringify(elementsToDocument(nodes, edges), null, 2);
    navigator.clipboard.writeText(json).then(
      () => toast.success("Copied the board as diagram JSON"),
      () => toast.error("Couldn't copy to the clipboard"),
    );
  };

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={onOpenChange}
      title="Actions"
      description="Add a component or run a board action."
    >
      <Command>
        <CommandInput placeholder="Add a component or run an action…" />
        <CommandList>
          <CommandEmpty>Nothing matches.</CommandEmpty>
          <CommandGroup heading="Add component">
            {listComponentDefinitions().map((definition) => (
              <CommandItem
                key={definition.type}
                value={`Add ${definition.label}`}
                keywords={[definition.type, definition.description]}
                onSelect={run(() => addComponent(definition.type))}
              >
                <ComponentIconChip componentType={definition.type} size="sm" />
                Add {definition.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Edit">
            <CommandItem onSelect={run(() => store.temporal.getState().undo())}>
              <ArrowCounterClockwiseIcon aria-hidden />
              Undo
              <CommandShortcut>⌘Z</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={run(() => store.temporal.getState().redo())}>
              <ArrowClockwiseIcon aria-hidden />
              Redo
              <CommandShortcut>⇧⌘Z</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={run(() => store.getState().selectAll())}>
              <SelectionAllIcon aria-hidden />
              Select all
              <CommandShortcut>⌘A</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={run(() => store.getState().duplicateSelection())}>
              <CopyIcon aria-hidden />
              Duplicate selection
              <CommandShortcut>⌘D</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={run(() => store.getState().deleteSelection())}>
              <TrashIcon aria-hidden />
              Delete selection
              <CommandShortcut>⌫</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={run(copyDiagramJson)}>
              <FileCodeIcon aria-hidden />
              Copy as diagram JSON
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="View">
            <CommandItem onSelect={run(() => void fitView(ANIMATED_FIT_VIEW_OPTIONS))}>
              <CornersOutIcon aria-hidden />
              Fit to view
              <CommandShortcut>⇧1</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={run(() => toggle("library"))}>
              <SidebarSimpleIcon aria-hidden />
              {collapsed.library ? "Show" : "Hide"} components
              <CommandShortcut>[</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={run(() => toggle("inspector"))}>
              <SidebarSimpleIcon className="-scale-x-100" aria-hidden />
              {isInspectorEnabled ? "Hide" : "Show"} inspector
              <CommandShortcut>]</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={run(() => toggle("results"))}>
              <SquareHalfBottomIcon aria-hidden />
              {collapsed.results ? "Show" : "Hide"} results
              <CommandShortcut>⌘J</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={run(toggleMinimap)}>
              <MapTrifoldIcon aria-hidden />
              {isMinimapVisible ? "Hide" : "Show"} minimap
              <CommandShortcut>M</CommandShortcut>
            </CommandItem>
            {THEMES.map(({ value, label }) => (
              <CommandItem key={value} value={`Theme: ${label}`} onSelect={run(() => setTheme(value))}>
                <CircleHalfIcon aria-hidden />
                Theme: {label}
              </CommandItem>
            ))}
            <CommandItem onSelect={run(() => router.push("/"))}>
              <ArrowLeftIcon aria-hidden />
              Back to projects
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
