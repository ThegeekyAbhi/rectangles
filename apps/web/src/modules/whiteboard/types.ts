import type { ValidatedConfig } from "@rectangles/engine";
import type { Edge, Node } from "@xyflow/react";

/** A component's settings, as the engine validates them. */
export type ComponentConfig = ValidatedConfig;

export type ComponentNodeData = {
  /** Component type, as registered in the engine. */
  componentType: string;
  label: string;
  config: ComponentConfig;
};

/** Every node on the board is drawn by the one `component` node renderer. */
export type ComponentNode = Node<ComponentNodeData, "component">;

/** An edge whose handles are the port ids it joins. */
export type ConnectionEdge = Edge;

export interface BoardElements {
  readonly nodes: ComponentNode[];
  readonly edges: ConnectionEdge[];
}
