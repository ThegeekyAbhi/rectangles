import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { memo } from "react";
import { findComponentDefinition } from "../lib/component-catalog";
import { portOffset } from "../lib/port-layout";
import type { ComponentNode as ComponentNodeType } from "../types";
import { useCanvasSlots } from "./canvas-slots";
import { ComponentCaption, ComponentTile } from "./component-tile";

/**
 * Draws any component as a square tile holding its icon, with its name and key settings
 * underneath. In ports sit on the left and out ports on the right, so designs read left
 * to right.
 */
export const ComponentNode = memo(function ComponentNode({
  id,
  data,
  selected,
}: NodeProps<ComponentNodeType>) {
  const { NodeOverlay } = useCanvasSlots();
  const ports = findComponentDefinition(data.componentType)?.ports ?? [];
  const inPorts = ports.filter((port) => port.direction === "in");
  const outPorts = ports.filter((port) => port.direction === "out");

  return (
    <ComponentTile
      componentType={data.componentType}
      selected={selected}
      className={selected ? "relative" : "relative hover:border-foreground/50"}
    >
      <ComponentCaption
        componentType={data.componentType}
        label={data.label}
        config={data.config}
        className="pointer-events-none absolute top-full left-1/2 mt-2 -translate-x-1/2"
      />

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
    </ComponentTile>
  );
});
