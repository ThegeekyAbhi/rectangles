import { cn } from "@/lib/utils";
import { categoryTextClass } from "../lib/component-categories";
import { findComponentDefinition, summariseConfig } from "../lib/component-catalog";
import type { ComponentConfig } from "../types";
import { ComponentIcon } from "./component-icon";

interface TileProps {
  componentType: string;
  selected?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/**
 * The square tile holding a component's icon. A component with no in ports, where
 * traffic starts, has a rounded left side. Shared by the board and read-only diagrams,
 * so both look the same; `children` are drawn on top (ports, run overlays).
 */
export function ComponentTile({ componentType, selected = false, className, children }: TileProps) {
  const definition = findComponentDefinition(componentType);
  const hasInPorts = definition?.ports.some((port) => port.direction === "in") ?? true;
  return (
    <div
      className={cn(
        "flex size-20 items-center justify-center rounded-xl border-2 border-node-border bg-card shadow-xs transition-[border-color,box-shadow] duration-150",
        !hasInPorts && "rounded-l-[2.5rem]",
        selected && "border-foreground shadow-md",
        className,
      )}
    >
      <ComponentIcon
        componentType={componentType}
        weight={selected ? "fill" : "duotone"}
        className={cn("size-9", categoryTextClass(componentType))}
      />
      {children}
    </div>
  );
}

interface CaptionProps {
  componentType: string;
  label: string;
  config: ComponentConfig;
  className?: string;
}

/**
 * A component's name and key settings, shown under its tile. A type this version does
 * not simulate shows its type id instead of settings.
 */
export function ComponentCaption({ componentType, label, config, className }: CaptionProps) {
  const definition = findComponentDefinition(componentType);
  const typeLabel = definition?.label ?? componentType;
  const summary = summariseConfig(componentType, config);
  return (
    <div className={cn("w-44 text-center", className)}>
      <div data-slot="node-label" className="line-clamp-2 text-sm leading-5 font-medium">
        {label}
      </div>
      <div
        data-slot="node-summary"
        title={summary === null ? undefined : `${typeLabel}: ${summary}`}
        className="truncate text-xs leading-4 text-muted-foreground tabular-nums"
      >
        {summary ?? typeLabel}
      </div>
    </div>
  );
}
