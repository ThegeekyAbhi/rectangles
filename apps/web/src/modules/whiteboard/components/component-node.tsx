import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { memo } from "react";
import { cn } from "@/lib/utils";
import { categoryTextClass } from "../lib/component-categories";
import { findComponentDefinition, summariseConfig } from "../lib/component-catalog";
import { portOffset } from "../lib/port-layout";
import type { ComponentNode as ComponentNodeType } from "../types";
import { useCanvasSlots } from "./canvas-slots";
import { ComponentIcon } from "./component-icon";

/**
 * Draws any component as a square tile holding its icon, with its name and key settings
 * underneath. In ports sit on the left and out ports on the right, so designs read left
 * to right. A component with no in ports, where traffic starts, has a rounded left side.
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
        "relative flex size-20 items-center justify-center rounded-xl border-2 border-node-border bg-card shadow-xs transition-[border-color,box-shadow] duration-150",
        inPorts.length === 0 && "rounded-l-[2.5rem]",
        selected ? "border-foreground shadow-md" : "hover:border-foreground/50",
      )}
    >
      <ComponentIcon
        componentType={data.componentType}
        weight={selected ? "fill" : "duotone"}
        className={cn("size-9", categoryTextClass(data.componentType))}
      />

      <div className="pointer-events-none absolute top-full left-1/2 mt-2 w-44 -translate-x-1/2 text-center">
        <div data-slot="node-label" className="line-clamp-2 text-sm leading-5 font-medium">
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
