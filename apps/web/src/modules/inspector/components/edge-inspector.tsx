"use client";

import { ArrowRightIcon, TrashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { ConnectionEdge } from "@/modules/whiteboard";
import { useWhiteboardStore } from "@/modules/whiteboard";

function EdgeEnd({ title, nodeLabel, port }: { title: string; nodeLabel: string; port: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-md border p-2.5">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="truncate text-sm font-medium">{nodeLabel}</div>
      <div className="font-mono text-xs text-muted-foreground">{port}</div>
    </div>
  );
}

export function EdgeInspector({ edge }: { edge: ConnectionEdge }) {
  const sourceLabel = useWhiteboardStore(
    (state) => state.nodes.find((node) => node.id === edge.source)?.data.label,
  );
  const targetLabel = useWhiteboardStore(
    (state) => state.nodes.find((node) => node.id === edge.target)?.data.label,
  );
  const deleteElements = useWhiteboardStore((state) => state.deleteElements);

  return (
    <div className="flex flex-col gap-4 p-4">
      <h2 className="text-sm font-medium">Connection</h2>
      <div className="flex items-center gap-2">
        <EdgeEnd title="From" nodeLabel={sourceLabel ?? "Missing"} port={edge.sourceHandle ?? ""} />
        <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <EdgeEnd title="To" nodeLabel={targetLabel ?? "Missing"} port={edge.targetHandle ?? ""} />
      </div>
      <Button variant="outline" size="sm" className="self-start" onClick={() => deleteElements([], [edge.id])}>
        <TrashIcon aria-hidden />
        Delete connection
      </Button>
    </div>
  );
}
