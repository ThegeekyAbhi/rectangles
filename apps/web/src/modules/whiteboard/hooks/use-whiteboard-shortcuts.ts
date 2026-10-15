import { useReactFlow } from "@xyflow/react";
import { useHotkeys } from "react-hotkeys-hook";
import { ANIMATED_FIT_VIEW_OPTIONS, ZOOM_DURATION_MS } from "../lib/viewport";
import { useCanvasViewStore } from "../store/canvas-view-store";
import { useWhiteboardStoreApi } from "../store/whiteboard-store-context";
import { useBoardPanels } from "./use-board-panels";

/**
 * Keyboard shortcuts for the board. `mod` is ⌘ on macOS and Ctrl elsewhere. Shortcuts
 * are ignored while typing in a field, except the one that opens the command palette.
 * Delete and Backspace are handled by the canvas itself.
 */
export function useWhiteboardShortcuts({ onOpenPalette }: { onOpenPalette: () => void }): void {
  const store = useWhiteboardStoreApi();
  const { fitView, zoomIn, zoomOut, zoomTo } = useReactFlow();
  const { toggle } = useBoardPanels();
  const preventDefault = { preventDefault: true };

  useHotkeys("mod+z", () => store.temporal.getState().undo(), preventDefault);
  useHotkeys(["mod+shift+z", "mod+y"], () => store.temporal.getState().redo(), preventDefault);
  // Copy is not prevented, so copying selected text elsewhere on the page still works.
  useHotkeys("mod+c", () => store.getState().copySelection());
  useHotkeys("mod+v", () => store.getState().pasteClipboard(), preventDefault);
  useHotkeys("mod+d", () => store.getState().duplicateSelection(), preventDefault);
  useHotkeys("mod+a", () => store.getState().selectAll(), preventDefault);
  useHotkeys("shift+1", () => void fitView(ANIMATED_FIT_VIEW_OPTIONS), preventDefault);
  useHotkeys("mod+equal", () => void zoomIn({ duration: ZOOM_DURATION_MS }), preventDefault);
  useHotkeys("mod+minus", () => void zoomOut({ duration: ZOOM_DURATION_MS }), preventDefault);
  useHotkeys("mod+0", () => void zoomTo(1, { duration: ZOOM_DURATION_MS }), preventDefault);
  useHotkeys("m", () => useCanvasViewStore.getState().toggleMinimap());
  useHotkeys("bracketleft", () => toggle("library"));
  useHotkeys("bracketright", () => toggle("inspector"));
  useHotkeys("mod+j", () => toggle("results"), preventDefault);
  useHotkeys("mod+k", onOpenPalette, { preventDefault: true, enableOnFormTags: true });
}
