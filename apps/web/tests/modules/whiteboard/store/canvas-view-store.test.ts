import { beforeEach, describe, expect, it } from "vitest";
import { useCanvasViewStore } from "@/modules/whiteboard/store/canvas-view-store";

const STORAGE_KEY = "rectangles-canvas-view";

describe("canvas view store", () => {
  beforeEach(() => {
    localStorage.clear();
    useCanvasViewStore.setState({ isMinimapVisible: true, isInspectorEnabled: true, panelSizes: {} });
  });

  it("shows the minimap until it is hidden", () => {
    expect(useCanvasViewStore.getState().isMinimapVisible).toBe(true);
    useCanvasViewStore.getState().toggleMinimap();
    expect(useCanvasViewStore.getState().isMinimapVisible).toBe(false);
    useCanvasViewStore.getState().toggleMinimap();
    expect(useCanvasViewStore.getState().isMinimapVisible).toBe(true);
  });

  it("saves the choice in the browser", () => {
    useCanvasViewStore.getState().toggleMinimap();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")).toMatchObject({
      state: { isMinimapVisible: false },
    });
  });

  it("turns the inspector off and on", () => {
    useCanvasViewStore.getState().setInspectorEnabled(false);
    expect(useCanvasViewStore.getState().isInspectorEnabled).toBe(false);
    useCanvasViewStore.getState().setInspectorEnabled(true);
    expect(useCanvasViewStore.getState().isInspectorEnabled).toBe(true);
  });

  it("remembers each panel's size in whole pixels", () => {
    useCanvasViewStore.getState().rememberPanelSize("inspector", 331.6);
    useCanvasViewStore.getState().rememberPanelSize("library", 260);
    expect(useCanvasViewStore.getState().panelSizes).toEqual({ inspector: 332, library: 260 });
  });

  it("leaves the stored sizes alone when a size has not changed", () => {
    useCanvasViewStore.getState().rememberPanelSize("inspector", 300);
    const before = useCanvasViewStore.getState().panelSizes;
    useCanvasViewStore.getState().rememberPanelSize("inspector", 300.2);
    expect(useCanvasViewStore.getState().panelSizes).toBe(before);
  });

  it("restores a saved choice", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { isMinimapVisible: false }, version: 0 }));
    await useCanvasViewStore.persist.rehydrate();
    expect(useCanvasViewStore.getState().isMinimapVisible).toBe(false);
  });
});
