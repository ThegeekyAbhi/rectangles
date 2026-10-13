import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { memo } from "react";
import { cn } from "@/lib/utils";
import { findComponentDefinition, summariseConfig } from "../lib/component-catalog";
import { portOffset } from "../lib/port-layout";
import type { ComponentNode as ComponentNodeType } from "../types";
import { useCanvasSlots } from "./canvas-slots";
import { ComponentIcon } from "./component-icon";

/**
 * Draws any component: its icon, name and key settings, with in ports on the left and
 * out ports on the right, so designs read left to right.
 */
export const ComponentNode = memo(function ComponentNode({
  id,
  data,
  selected,
}: NodeProps<ComponentNodeType>) {
  const { NodeOverlay } = useCanvasSlots();
  const definition = findComponentDefinition(data.componentType);
  const typeLabel = definition?.label ?? "Unknown component";
  const summary = summariseConfig(data.componentType, data.config);
  const ports = definition?.ports ?? [];
  const inPorts = ports.filter((port) => port.direction === "in");
  const outPorts = ports.filter((port) => port.direction === "out");

  return (
    <div
      className={cn(
        "relative flex h-16 w-52 items-center gap-3 rounded-lg border border-node-border bg-card px-3 shadow-xs transition-[border-color,box-shadow] duration-150",
        selected ? "border-foreground shadow-md" : "hover:border-foreground/30",
      )}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
        <ComponentIcon
          componentType={data.componentType}
          weight={selected ? "fill" : "duotone"}
          className="size-5"
        />
      </div>
      <div className="min-w-0">
        <div data-slot="node-label" className="truncate text-sm leading-5 font-medium">
          {data.label}
        </div>
        <div
          data-slot="node-summary"
          title={summary === null ? undefined : `${typeLabel}: ${summary}`}
          className="truncate text-xs leading-4 text-muted-foreground tabular-nums"
        >
          {summary ?? typeLabel}
        </div>
      </div>

      {NodeOverlay !== undefined && <NodeOverlay nodeId={id} />}

      {inPorts.map((port, index) => (
        <Handle
          key={port.id}
          id={port.id}
          type="target"
          position={Position.Left}
          style={{ top: `${portOffset(index, inPorts.length) * 100}%` }}
          title={port.description}
          aria-label={`${data.label}: ${port.id} port`}
        />
      ))}
      {outPorts.map((port, index) => (
        <Handle
          key={port.id}
          id={port.id}
          type="source"
          position={Position.Right}
          style={{ top: `${portOffset(index, outPorts.length) * 100}%` }}
          title={port.description}
          aria-label={`${data.label}: ${port.id} port`}
        />
      ))}
    </div>
  );
});
