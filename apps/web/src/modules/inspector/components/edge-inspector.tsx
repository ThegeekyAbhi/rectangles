"use client";

import { ArrowRightIcon, TrashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { ConnectionEdge } from "@/modules/whiteboard";
import { findConnectionFields, useWhiteboardStore } from "@/modules/whiteboard";
import { isFieldRelevant } from "../lib/parse-field-input";
import { ConfigFieldInput } from "./config-field-input";

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
  const sourceType = useWhiteboardStore(
    (state) => state.nodes.find((node) => node.id === edge.source)?.data.componentType,
  );
  const setEdgeConfig = useWhiteboardStore((state) => state.setEdgeConfig);
  const deleteElements = useWhiteboardStore((state) => state.deleteElements);
  const fields = findConnectionFields(sourceType ?? "", edge.sourceHandle ?? "");
  const config = edge.data?.config ?? {};
  const settingsId = `${edge.id}-settings`;

  return (
    <div className="flex flex-col gap-4 p-4">
      <h2 className="pr-7 text-sm font-medium">Connection</h2>
      <div className="flex items-center gap-2">
        <EdgeEnd title="From" nodeLabel={sourceLabel ?? "Missing"} port={edge.sourceHandle ?? ""} />
        <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <EdgeEnd title="To" nodeLabel={targetLabel ?? "Missing"} port={edge.targetHandle ?? ""} />
      </div>
      {Object.keys(fields).length > 0 && (
        <section aria-labelledby={settingsId} className="@container flex flex-col gap-3">
          <h3 id={settingsId} className="mb-0.5 text-xs font-medium text-muted-foreground">
            Settings
          </h3>
          {Object.entries(fields)
            .filter(([fieldName]) => isFieldRelevant(fields, config, fieldName))
            .map(([fieldName, field]) => (
              <ConfigFieldInput
                key={fieldName}
                fieldName={fieldName}
                field={field}
                fields={fields}
                config={config}
                onCommit={(value) => setEdgeConfig(edge.id, { ...config, [fieldName]: value })}
              />
            ))}
        </section>
      )}
      <Button variant="outline" size="sm" className="self-start" onClick={() => deleteElements([], [edge.id])}>
        <TrashIcon aria-hidden />
        Delete connection
      </Button>
    </div>
  );
}
