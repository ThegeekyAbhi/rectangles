export { ComponentIconChip } from "./components/component-icon-chip";
export { Whiteboard, WhiteboardSkeleton } from "./components/whiteboard";
export { findComponentDefinition, findConnectionFields } from "./lib/component-catalog";
export { useBoardPanels } from "./hooks/use-board-panels";
export { elementsToDocument, hasSameConnections } from "./lib/document-conversion";
export { useWhiteboardStore, useWhiteboardStoreApi } from "./store/whiteboard-store-context";
export type {
  BoardElements,
  ComponentConfig,
  ComponentNode,
  ComponentNodeData,
  ConnectionConfig,
  ConnectionEdge,
} from "./types";
