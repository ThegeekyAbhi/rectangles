import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BoardPanelName } from "../hooks/use-board-panels";

export interface CanvasViewState {
  readonly isMinimapVisible: boolean;
  /**
   * Whether the inspector may appear. While it may, it shows whenever something is
   * selected and hides when nothing is.
   */
  readonly isInspectorEnabled: boolean;
  /** The last size of each panel while showing, in pixels, to return to when shown again. */
  readonly panelSizes: Readonly<Partial<Record<BoardPanelName, number>>>;
  toggleMinimap(): void;
  setInspectorEnabled(isEnabled: boolean): void;
  rememberPanelSize(panel: BoardPanelName, pixels: number): void;
}

/**
 * How the board is shown, as opposed to what is on it. These are a person's
 * preferences: they apply to every board, are remembered in this browser, and are
 * never part of a saved project or its undo history.
 */
export const useCanvasViewStore = create<CanvasViewState>()(
  persist(
    (set, get) => ({
      isMinimapVisible: true,
      isInspectorEnabled: true,
      panelSizes: {},
      toggleMinimap() {
        set((state) => ({ isMinimapVisible: !state.isMinimapVisible }));
      },
      setInspectorEnabled(isEnabled) {
        set({ isInspectorEnabled: isEnabled });
      },
      rememberPanelSize(panel, pixels) {
        const rounded = Math.round(pixels);
        // Called on every frame of a drag; only a changed size is worth storing.
        if (get().panelSizes[panel] !== rounded) {
          set((state) => ({ panelSizes: { ...state.panelSizes, [panel]: rounded } }));
        }
      },
    }),
    { name: "rectangles-canvas-view" },
  ),
);
