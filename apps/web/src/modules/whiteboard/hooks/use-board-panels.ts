"use client";

import { createContext, useContext } from "react";

/** The panels around the canvas that can be resized and hidden. */
export type BoardPanelName = "library" | "inspector" | "results";

export interface BoardPanels {
  /** Whether each panel is hidden right now. */
  readonly collapsed: Readonly<Record<BoardPanelName, boolean>>;
  /**
   * Whether the inspector may appear. While it may, it shows whenever something is
   * selected, so it can be enabled and still be hidden.
   */
  readonly isInspectorEnabled: boolean;
  /**
   * Hides a panel that is showing, or brings a hidden one back at its last size. For
   * the inspector, turns it off or on.
   */
  toggle(panel: BoardPanelName): void;
  /** Brings a panel back if it is hidden. For the inspector, turns it on. */
  show(panel: BoardPanelName): void;
}

export const BoardPanelsContext = createContext<BoardPanels | null>(null);

/** Which panels are showing, and the actions that show and hide them. */
export function useBoardPanels(): BoardPanels {
  const panels = useContext(BoardPanelsContext);
  if (panels === null) {
    throw new Error("useBoardPanels must be used inside a BoardPanelsProvider.");
  }
  return panels;
}
