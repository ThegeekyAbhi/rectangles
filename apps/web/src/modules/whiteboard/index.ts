export { ComponentIcon } from "./components/component-icon";
export { Whiteboard, WhiteboardSkeleton } from "./components/whiteboard";
export { findComponentDefinition } from "./lib/component-catalog";
export { useBoardPanels } from "./hooks/use-board-panels";
export { elementsToDocument } from "./lib/document-conversion";
export { useWhiteboardStore, useWhiteboardStoreApi } from "./store/whiteboard-store-context";
export type {
  BoardElements,
  ComponentConfig,
  ComponentNode,
  ComponentNodeData,
  ConnectionEdge,
} from "./types";
