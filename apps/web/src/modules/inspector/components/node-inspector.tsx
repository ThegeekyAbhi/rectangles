"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { ComponentNodeData } from "@/modules/whiteboard";
import { ComponentIcon, findComponentDefinition, useWhiteboardStore } from "@/modules/whiteboard";
import { isFieldRelevant } from "../lib/parse-field-input";
import { ConfigFieldInput } from "./config-field-input";

function NameInput({ label, onRename }: { label: string; onRename: (label: string) => void }) {
  const [name, setName] = useState(label);
  const inputId = useId();

  const commit = () => {
    const trimmed = name.trim();
    if (trimmed === "") {
      setName(label);
    } else if (trimmed !== label) {
      onRename(trimmed);
    }
  };

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={inputId}>Name</Label>
      <Input
        id={inputId}
        value={name}
        maxLength={60}
        onChange={(event) => setName(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit();
          } else if (event.key === "Escape") {
            setName(label);
          }
        }}
      />
    </div>
  );
}

export function NodeInspector({ nodeId, data }: { nodeId: string; data: ComponentNodeData }) {
  const renameNode = useWhiteboardStore((state) => state.renameNode);
  const setNodeConfig = useWhiteboardStore((state) => state.setNodeConfig);
  const definition = findComponentDefinition(data.componentType);

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
          <ComponentIcon componentType={data.componentType} weight="duotone" className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-medium">{definition?.label ?? "Unknown component"}</h2>
          <p className="text-xs text-muted-foreground">
            {definition?.description ??
              `This version of Rectangles has no component of type “${data.componentType}”. It is kept on the board but cannot be configured or simulated.`}
          </p>
        </div>
      </div>

      {/* Remounting on a new label resets the draft after undo or redo. */}
      <NameInput key={data.label} label={data.label} onRename={(label) => renameNode(nodeId, label)} />

      {definition !== undefined && (
        <>
          <Separator />
          <div className="flex flex-col gap-4">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Settings</h3>
            {Object.entries(definition.configFields)
              .filter(([fieldName]) => isFieldRelevant(definition.configFields, data.config, fieldName))
              .map(([fieldName, field]) => (
                <ConfigFieldInput
                  key={fieldName}
                  fieldName={fieldName}
                  field={field}
                  fields={definition.configFields}
                  config={data.config}
                  onCommit={(value) => setNodeConfig(nodeId, { ...data.config, [fieldName]: value })}
                />
              ))}
          </div>

          <Separator />
          <details className="group text-xs">
            <summary className="cursor-pointer rounded-sm font-medium text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
              What this component does not model
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
              {definition.notModeled.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
