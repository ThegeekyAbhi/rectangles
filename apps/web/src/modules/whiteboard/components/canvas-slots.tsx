"use client";

import type { ComponentType } from "react";
import { createContext, useContext } from "react";

/**
 * Places on the canvas that other modules can draw into, such as live figures during a
 * simulation run. The board knows nothing about what fills them.
 */
export interface CanvasSlots {
  /** Drawn on top of each component. Positions itself against the component's box. */
  readonly NodeOverlay?: ComponentType<{ nodeId: string }> | undefined;
  /** Drawn at the middle of each connection. */
  readonly EdgeLabel?: ComponentType<{ edgeId: string }> | undefined;
}

const CanvasSlotsContext = createContext<CanvasSlots>({});

export const CanvasSlotsProvider = CanvasSlotsContext;

export function useCanvasSlots(): CanvasSlots {
  return useContext(CanvasSlotsContext);
}
