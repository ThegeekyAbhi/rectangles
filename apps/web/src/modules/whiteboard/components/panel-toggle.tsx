"use client";

import type { BoardPanelName } from "../hooks/use-board-panels";
import { useBoardPanels } from "../hooks/use-board-panels";
import { ToolbarButton } from "./toolbar-button";

/** Shows or hides one of the panels around the canvas. Pressed while the panel is showing. */
export function PanelToggle({
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
