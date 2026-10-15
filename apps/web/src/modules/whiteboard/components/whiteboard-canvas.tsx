"use client";

import "@xyflow/react/dist/style.css";
import { CursorClickIcon } from "@phosphor-icons/react";
import type { Connection, NodeChange, OnBeforeDelete } from "@xyflow/react";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  MiniMap,
  Panel,
  ReactFlow,
  SelectionMode,
} from "@xyflow/react";
import { useTheme } from "next-themes";
import { useCallback, useState } from "react";
import { useAlignmentGuides } from "../hooks/use-alignment-guides";
import { useBoardPanels } from "../hooks/use-board-panels";
import { GRID_SIZE } from "../lib/component-visuals";
import { isWellFormedConnection } from "../lib/connection-check";
import { EDGE_TYPE } from "../lib/document-conversion";
import { FIT_VIEW_OPTIONS } from "../lib/viewport";
import { useCanvasViewStore } from "../store/canvas-view-store";
import { useWhiteboardStore, useWhiteboardStoreApi } from "../store/whiteboard-store-context";
import type {
  ComponentNode as ComponentNodeType,
  ConnectionEdge as ConnectionEdgeType,
} from "../types";
import { AlignmentGuides } from "./alignment-guides";
import { CanvasToolbar } from "./canvas-toolbar";
import { ComponentNode } from "./component-node";
import { ConnectionEdge } from "./connection-edge";
import { EdgeMarkers } from "./edge-markers";

const NODE_TYPES = { component: ComponentNode };
const EDGE_TYPES = { [EDGE_TYPE]: ConnectionEdge };
const SNAP_GRID: [number, number] = [GRID_SIZE, GRID_SIZE];
const DELETE_KEYS = ["Backspace", "Delete"];
// Left-drag selects, like a design tool; scroll, middle-drag, right-drag or Space pans.
const PAN_BUTTONS = [1, 2];
const DEFAULT_EDGE_OPTIONS = { type: EDGE_TYPE };

export function WhiteboardCanvas() {
  const store = useWhiteboardStoreApi();
  const nodes = useWhiteboardStore((state) => state.nodes);
  const edges = useWhiteboardStore((state) => state.edges);
  const applyEdgeChanges = useWhiteboardStore((state) => state.applyEdgeChanges);
  const connect = useWhiteboardStore((state) => state.connect);
  const { guides, alignChanges } = useAlignmentGuides();
  const { resolvedTheme } = useTheme();
  const { show } = useBoardPanels();
  const isMinimapVisible = useCanvasViewStore((state) => state.isMinimapVisible);
  // The first click of a double-click selects the item, so the inspector opens on it.
  const openInspector = useCallback(() => {
    show("inspector");
  }, [show]);
  // Fit a saved board into view when it opens. An empty board must not do this: the
  // canvas would re-centre on the first node added and shift it away from the cursor.
  const [shouldFitOnOpen] = useState(() => store.getState().nodes.length > 0);

  const handleNodesChange = useCallback(
    (changes: NodeChange<ComponentNodeType>[]) => {
      store.getState().applyNodeChanges(alignChanges(changes));
    },
    [alignChanges, store],
  );

  const isValidConnection = useCallback(
    (connection: Connection | ConnectionEdgeType) => {
      const state = store.getState();
      return isWellFormedConnection(connection, state.nodes, state.edges);
    },
    [store],
  );

  // The canvas would report a delete as separate node and edge changes, which would
  // take two undos to reverse. Doing it here in one store update keeps it to one.
  const deleteInOneStep = useCallback<OnBeforeDelete<ComponentNodeType, ConnectionEdgeType>>(
    (elements) => {
      store.getState().deleteElements(
        elements.nodes.map((node) => node.id),
        elements.edges.map((edge) => edge.id),
      );
      return Promise.resolve(false);
    },
    [store],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      colorMode={resolvedTheme === "dark" ? "dark" : "light"}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      onNodesChange={handleNodesChange}
      onEdgesChange={applyEdgeChanges}
      onConnect={connect}
      onBeforeDelete={deleteInOneStep}
      onNodeDoubleClick={openInspector}
      onEdgeDoubleClick={openInspector}
      attributionPosition="bottom-left"
      isValidConnection={isValidConnection}
      defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
      connectionLineType={ConnectionLineType.Bezier}
      snapToGrid
      snapGrid={SNAP_GRID}
      panOnScroll
      panOnDrag={PAN_BUTTONS}
      selectionOnDrag
      selectionMode={SelectionMode.Partial}
      deleteKeyCode={DELETE_KEYS}
      minZoom={0.25}
      maxZoom={2}
      fitView={shouldFitOnOpen}
      fitViewOptions={FIT_VIEW_OPTIONS}
    >
      <Background variant={BackgroundVariant.Dots} gap={GRID_SIZE} size={1} />
      {/* The minimap sits above the toolbar, which has the same corner. */}
      {isMinimapVisible && <MiniMap pannable zoomable ariaLabel="Board overview" className="mb-16!" />}
      <CanvasToolbar />
      <EdgeMarkers />
      <AlignmentGuides guides={guides} />
      {nodes.length === 0 && (
        <Panel position="top-center" className="pointer-events-none top-1/3! text-center">
          <CursorClickIcon weight="duotone" className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-sm font-medium">This board is empty</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Drag a component in from the left, or press ⌘K and type its name.
          </p>
        </Panel>
      )}
    </ReactFlow>
  );
}
