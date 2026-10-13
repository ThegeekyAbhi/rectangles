"use client";

import { CopyIcon, TrashIcon } from "@phosphor-icons/react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { useWhiteboardStore } from "@/modules/whiteboard";
import { EdgeInspector } from "./edge-inspector";
import { NodeInspector } from "./node-inspector";

function InspectorHint({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="p-4">
      <h2 className="text-sm font-medium">{title}</h2>
      {children}
    </div>
  );
}

/** Shows the settings of whatever is selected on the board. */
export function InspectorPanel() {
  const selection = useWhiteboardStore(
    useShallow((state) => {
      const nodeIds = state.nodes.filter((node) => node.selected).map((node) => node.id);
      const edgeIds = state.edges.filter((edge) => edge.selected).map((edge) => edge.id);
      return {
        nodeCount: nodeIds.length,
        edgeCount: edgeIds.length,
        onlyNodeId: nodeIds.length === 1 && edgeIds.length === 0 ? nodeIds[0] : undefined,
        onlyEdgeId: edgeIds.length === 1 && nodeIds.length === 0 ? edgeIds[0] : undefined,
        totalNodes: state.nodes.length,
        totalEdges: state.edges.length,
      };
    }),
  );
  // Subscribing to the node's data alone keeps the form still while the node is dragged.
  const nodeData = useWhiteboardStore(
    (state) => state.nodes.find((node) => node.id === selection.onlyNodeId)?.data,
  );
  const edge = useWhiteboardStore((state) =>
    state.edges.find((candidate) => candidate.id === selection.onlyEdgeId),
  );
  const duplicateSelection = useWhiteboardStore((state) => state.duplicateSelection);
  const deleteSelection = useWhiteboardStore((state) => state.deleteSelection);

  if (selection.onlyNodeId !== undefined && nodeData !== undefined) {
    return <NodeInspector key={selection.onlyNodeId} nodeId={selection.onlyNodeId} data={nodeData} />;
  }
  if (edge !== undefined) {
    return <EdgeInspector edge={edge} />;
  }
  if (selection.nodeCount + selection.edgeCount > 0) {
    const parts = [
      selection.nodeCount > 0 && `${selection.nodeCount} component${selection.nodeCount === 1 ? "" : "s"}`,
      selection.edgeCount > 0 && `${selection.edgeCount} connection${selection.edgeCount === 1 ? "" : "s"}`,
    ].filter(Boolean);
    return (
      <InspectorHint title={`${parts.join(" and ")} selected`}>
        <div className="mt-3 flex gap-2">
          <Button variant="outline" size="sm" onClick={duplicateSelection} disabled={selection.nodeCount === 0}>
            <CopyIcon aria-hidden />
            Duplicate
          </Button>
          <Button variant="outline" size="sm" onClick={deleteSelection}>
            <TrashIcon aria-hidden />
            Delete
          </Button>
        </div>
      </InspectorHint>
    );
  }
  return (
    <InspectorHint title="Nothing selected">
      <p className="mt-1 text-sm text-muted-foreground">
        Select a component or a connection to see and change its settings.
      </p>
      <p className="mt-4 text-xs text-muted-foreground">
        {selection.totalNodes} component{selection.totalNodes === 1 ? "" : "s"} · {selection.totalEdges}{" "}
        connection{selection.totalEdges === 1 ? "" : "s"}
      </p>
    </InspectorHint>
  );
}
