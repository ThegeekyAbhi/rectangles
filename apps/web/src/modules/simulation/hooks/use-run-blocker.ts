import { useMemo } from "react";
import { elementsToDocument, useWhiteboardStore } from "@/modules/whiteboard";
import { documentToDesign } from "../lib/document-to-design";
import { findRunBlocker } from "../lib/run-blocker";
import { useRunStore } from "../store/run-store-context";

/** Why the open board cannot be run yet, or `null` if it can. */
export function useRunBlocker(): string | null {
  const nodes = useWhiteboardStore((state) => state.nodes);
  const edges = useWhiteboardStore((state) => state.edges);
  const durationSeconds = useRunStore((state) => state.durationSeconds);
  return useMemo(() => {
    const labels = new Map(nodes.map((node) => [node.id, node.data.label]));
    return findRunBlocker(
      documentToDesign(elementsToDocument(nodes, edges), durationSeconds),
      (nodeId) => labels.get(nodeId) ?? nodeId,
    );
  }, [nodes, edges, durationSeconds]);
}
