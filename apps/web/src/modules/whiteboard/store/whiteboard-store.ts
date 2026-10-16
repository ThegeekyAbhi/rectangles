import type { ConnectionVerdict } from "@rectangles/rules";
import { isConnectable } from "@rectangles/rules";
import type { Connection, EdgeChange, NodeChange, XYPosition } from "@xyflow/react";
import { applyEdgeChanges, applyNodeChanges } from "@xyflow/react";
import { temporal } from "zundo";
import { createStore } from "zustand/vanilla";
import { uniqueName } from "@/lib/unique-name";
import { readClipboard, writeClipboard } from "../lib/clipboard";
import { completeConnectionConfig, defaultConfigFor, findComponentDefinition } from "../lib/component-catalog";
import { checkBoardConnection, toBoardGraph } from "../lib/connection-check";
import { EDGE_TYPE, isSameDocument } from "../lib/document-conversion";
import { pickCopiedElements, placePastedElements } from "../lib/paste-placement";
import type { BoardElements, ComponentConfig, ComponentNode, ConnectionConfig, ConnectionEdge } from "../types";

const HISTORY_LIMIT = 100;

export interface WhiteboardState extends BoardElements {
  /** Applies what the canvas reports: moves, selection, measured sizes. */
  applyNodeChanges(changes: NodeChange<ComponentNode>[]): void;
  applyEdgeChanges(changes: EdgeChange<ConnectionEdge>[]): void;
  /**
   * Adds an edge if the connection rules allow it, and returns their verdict, so the
   * caller can explain a warning without judging the connection again.
   */
  connect(connection: Connection): ConnectionVerdict;
  /** Adds a component with default settings, selects it, and returns its id. */
  addNode(componentType: string, position: XYPosition): string;
  renameNode(nodeId: string, label: string): void;
  setNodeConfig(nodeId: string, config: ComponentConfig): void;
  setEdgeConfig(edgeId: string, config: ConnectionConfig): void;
  /** Removes nodes and edges, plus every edge attached to a removed node. */
  deleteElements(nodeIds: readonly string[], edgeIds: readonly string[]): void;
  deleteSelection(): void;
  selectAll(): void;
  /** Copies the selected nodes and returns how many were copied. */
  copySelection(): number;
  pasteClipboard(): void;
  duplicateSelection(): void;
}

function withSelection<Element extends { selected?: boolean }>(
  elements: readonly Element[],
  isSelected: boolean,
): Element[] {
  return elements.map((element) =>
    (element.selected ?? false) === isSelected ? element : { ...element, selected: isSelected },
  );
}

function updateNodeData(
  nodes: readonly ComponentNode[],
  nodeId: string,
  change: (data: ComponentNode["data"]) => ComponentNode["data"],
): ComponentNode[] {
  return nodes.map((node) => (node.id === nodeId ? { ...node, data: change(node.data) } : node));
}

/**
 * Creates the store behind one open board. The nodes and edges are the single source
 * of truth; the canvas draws them and the saved document is derived from them.
 *
 * Undo history records document changes only. Selecting, measuring and panning never
 * add a step, and a whole drag is one step.
 */
export function createWhiteboardStore(initial: BoardElements) {
  const store = createStore<WhiteboardState>()(
    temporal(
      (set, get) => {
        const insertElements = (added: BoardElements) => {
          const labels = get().nodes.map((node) => node.data.label);
          const nodes = added.nodes.map((node) => {
            const label = uniqueName(node.data.label, labels);
            labels.push(label);
            return label === node.data.label ? node : { ...node, data: { ...node.data, label } };
          });
          set((state) => ({
            nodes: [...withSelection(state.nodes, false), ...nodes],
            edges: [...withSelection(state.edges, false), ...added.edges],
          }));
        };

        return {
          nodes: initial.nodes,
          edges: initial.edges,

          applyNodeChanges(changes) {
            const isDragging = changes.some(
              (change) => change.type === "position" && change.dragging === true,
            );
            const isDrop = changes.some(
              (change) => change.type === "position" && change.dragging === false,
            );
            set((state) => ({ nodes: applyNodeChanges(changes, state.nodes) }));

            // The first change of a drag is recorded, which stores the board as it was
            // before the drag. Recording then pauses until the drop, so the drag is
            // undone in one step however many moves it took.
            const history = store.temporal.getState();
            if (isDragging && history.isTracking) {
              history.pause();
            } else if (isDrop && !isDragging) {
              history.resume();
            }
          },

          applyEdgeChanges(changes) {
            set((state) => ({ edges: applyEdgeChanges(changes, state.edges) }));
          },

          connect(connection) {
            const { nodes, edges } = get();
            const verdict = checkBoardConnection(connection, toBoardGraph(nodes, edges));
            if (!isConnectable(verdict)) {
              return verdict;
            }
            const sourceType = nodes.find((node) => node.id === connection.source)?.data.componentType ?? "";
            const edge: ConnectionEdge = {
              id: crypto.randomUUID(),
              type: EDGE_TYPE,
              source: connection.source,
              sourceHandle: connection.sourceHandle,
              target: connection.target,
              targetHandle: connection.targetHandle,
              data: { config: completeConnectionConfig(sourceType, connection.sourceHandle ?? "", {}) },
            };
            set({ edges: [...edges, edge] });
            return verdict;
          },

          addNode(componentType, position) {
            const id = crypto.randomUUID();
            const label = findComponentDefinition(componentType)?.label ?? componentType;
            insertElements({
              nodes: [
                {
                  id,
                  type: "component",
                  position,
                  data: { componentType, label, config: defaultConfigFor(componentType) },
                  selected: true,
                },
              ],
              edges: [],
            });
            return id;
          },

          renameNode(nodeId, label) {
            set((state) => ({
              nodes: updateNodeData(state.nodes, nodeId, (data) =>
                data.label === label ? data : { ...data, label },
              ),
            }));
          },

          setNodeConfig(nodeId, config) {
            set((state) => ({
              nodes: updateNodeData(state.nodes, nodeId, (data) => ({ ...data, config })),
            }));
          },

          setEdgeConfig(edgeId, config) {
            set((state) => ({
              edges: state.edges.map((edge) => (edge.id === edgeId ? { ...edge, data: { ...edge.data, config } } : edge)),
            }));
          },

          deleteElements(nodeIds, edgeIds) {
            const removedNodes = new Set(nodeIds);
            const removedEdges = new Set(edgeIds);
            if (removedNodes.size === 0 && removedEdges.size === 0) {
              return;
            }
            set((state) => ({
              nodes: state.nodes.filter((node) => !removedNodes.has(node.id)),
              edges: state.edges.filter(
                (edge) =>
                  !removedEdges.has(edge.id) &&
                  !removedNodes.has(edge.source) &&
                  !removedNodes.has(edge.target),
              ),
            }));
          },

          deleteSelection() {
            const { nodes, edges, deleteElements } = get();
            deleteElements(
              nodes.filter((node) => node.selected).map((node) => node.id),
              edges.filter((edge) => edge.selected).map((edge) => edge.id),
            );
          },

          selectAll() {
            set((state) => ({
              nodes: withSelection(state.nodes, true),
              edges: withSelection(state.edges, true),
            }));
          },

          copySelection() {
            const { nodes, edges } = get();
            const copied = pickCopiedElements(nodes, edges);
            writeClipboard(copied);
            return copied.nodes.length;
          },

          pasteClipboard() {
            const clipboard = readClipboard();
            if (clipboard !== null) {
              insertElements(
                placePastedElements(clipboard.elements, clipboard.pasteNumber, () =>
                  crypto.randomUUID(),
                ),
              );
            }
          },

          duplicateSelection() {
            const { nodes, edges } = get();
            const copied = pickCopiedElements(nodes, edges);
            if (copied.nodes.length > 0) {
              insertElements(placePastedElements(copied, 1, () => crypto.randomUUID()));
            }
          },
        };
      },
      {
        limit: HISTORY_LIMIT,
        partialize: (state): BoardElements => ({ nodes: state.nodes, edges: state.edges }),
        equality: isSameDocument,
      },
    ),
  );
  return store;
}

export type WhiteboardStore = ReturnType<typeof createWhiteboardStore>;
