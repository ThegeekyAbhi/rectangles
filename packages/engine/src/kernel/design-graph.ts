import type { ComponentRegistry, RegisteredComponent } from "../contract/component-definition.ts";
import type { ValidatedConfig } from "./config-validation.ts";
import { validateConfig } from "./config-validation.ts";

export interface DesignNode {
  readonly id: string;
  readonly type: string;
  /** Fields left out take the component's defaults. */
  readonly config?: Readonly<Record<string, unknown>>;
}

export interface PortReference {
  readonly node: string;
  readonly port: string;
}

export interface DesignEdge {
  readonly id: string;
  readonly from: PortReference;
  readonly to: PortReference;
}

export interface RunSettings {
  readonly durationSeconds: number;
  /** A non-negative whole number. The same design and seed give identical results. */
  readonly seed: number;
}

/** The document the engine runs: an architecture plus the settings of one run. */
export interface SimulationDesign {
  readonly schemaVersion: 1;
  readonly run: RunSettings;
  readonly nodes: readonly DesignNode[];
  readonly edges: readonly DesignEdge[];
}

export type DesignIssueCode =
  | "invalid-document"
  | "unsupported-schema-version"
  | "invalid-run-settings"
  | "duplicate-node-id"
  | "unknown-component-type"
  | "invalid-config"
  | "unknown-node"
  | "unknown-port"
  | "wrong-port-direction";

export interface DesignIssue {
  readonly code: DesignIssueCode;
  readonly message: string;
  readonly nodeId?: string;
  readonly edgeId?: string;
  readonly field?: string;
}

/** Thrown when a design cannot be run. Lists every problem found, not just the first. */
export class DesignError extends Error {
  readonly issues: readonly DesignIssue[];

  constructor(issues: readonly DesignIssue[]) {
    super(`The design cannot be run:\n${issues.map((issue) => `- ${issue.message}`).join("\n")}`);
    this.name = "DesignError";
    this.issues = issues;
  }
}

export interface GraphNode {
  readonly id: string;
  readonly component: RegisteredComponent;
  readonly config: ValidatedConfig;
  /** For each of the component's ports, by position: the node indices it sends to. */
  readonly targetsByPort: readonly (readonly number[])[];
  /** The edge behind each entry of `targetsByPort`, as an index into the graph's `edgeIds`. */
  readonly edgesByPort: readonly (readonly number[])[];
}

export interface DesignGraph {
  readonly run: RunSettings;
  readonly nodes: readonly GraphNode[];
  /** Ids of the design's edges, in the design's order. */
  readonly edgeIds: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPortReference(value: unknown): value is PortReference {
  return isRecord(value) && typeof value.node === "string" && typeof value.port === "string";
}

/**
 * Turns a design document into an indexed graph, checking that it is well formed:
 * known component types, valid configs, and edges that join an out port to an in port.
 *
 * Whether a connection makes sense (protocols, cardinality, graph rules) is decided by
 * the rules package, not here.
 *
 * @throws {DesignError} if the document is malformed.
 */
export function buildDesignGraph(design: unknown, registry: ComponentRegistry): DesignGraph {
  if (!isRecord(design) || !Array.isArray(design.nodes) || !Array.isArray(design.edges)) {
    throw new DesignError([
      { code: "invalid-document", message: "A design needs `nodes` and `edges` arrays." },
    ]);
  }
  const issues: DesignIssue[] = [];

  if (design.schemaVersion !== 1) {
    issues.push({
      code: "unsupported-schema-version",
      message: `Schema version ${String(design.schemaVersion)} is not supported; expected 1.`,
    });
  }

  const run = design.run;
  let runSettings: RunSettings = { durationSeconds: 0, seed: 0 };
  if (
    !isRecord(run) ||
    typeof run.durationSeconds !== "number" ||
    !Number.isFinite(run.durationSeconds) ||
    run.durationSeconds <= 0
  ) {
    issues.push({
      code: "invalid-run-settings",
      message: "`run.durationSeconds` must be a number greater than 0.",
    });
  } else if (typeof run.seed !== "number" || !Number.isSafeInteger(run.seed) || run.seed < 0) {
    issues.push({
      code: "invalid-run-settings",
      message: "`run.seed` must be a non-negative whole number.",
    });
  } else {
    runSettings = { durationSeconds: run.durationSeconds, seed: run.seed };
  }

  const nodeIndexById = new Map<string, number>();
  const nodes: {
    id: string;
    component: RegisteredComponent;
    config: ValidatedConfig;
    targetsByPort: number[][];
    edgesByPort: number[][];
  }[] = [];
  const edgeIds: string[] = [];

  for (const node of design.nodes as unknown[]) {
    if (!isRecord(node) || typeof node.id !== "string" || typeof node.type !== "string") {
      issues.push({ code: "invalid-document", message: "Every node needs a string `id` and `type`." });
      continue;
    }
    const nodeId = node.id;
    if (nodeIndexById.has(nodeId)) {
      issues.push({ code: "duplicate-node-id", nodeId, message: `Node id "${nodeId}" is used more than once.` });
      continue;
    }
    const component = registry.get(node.type);
    if (component === undefined) {
      issues.push({
        code: "unknown-component-type",
        nodeId,
        message: `Node "${nodeId}" has unknown type "${node.type}".`,
      });
      continue;
    }
    const validation = validateConfig(component.definition.configFields, node.config);
    if (!validation.ok) {
      for (const issue of validation.issues) {
        issues.push({
          code: "invalid-config",
          nodeId,
          field: issue.field,
          message: `Node "${nodeId}", field "${issue.field}": ${issue.message}`,
        });
      }
      continue;
    }
    nodeIndexById.set(nodeId, nodes.length);
    nodes.push({
      id: nodeId,
      component,
      config: validation.config,
      targetsByPort: component.definition.ports.map(() => []),
      edgesByPort: component.definition.ports.map(() => []),
    });
  }

  // Edges that touch a node already reported above would only repeat that report.
  const hasNodeIssues = issues.some((issue) => issue.nodeId !== undefined);

  for (const edge of design.edges as unknown[]) {
    if (
      !isRecord(edge) ||
      typeof edge.id !== "string" ||
      !isPortReference(edge.from) ||
      !isPortReference(edge.to)
    ) {
      issues.push({ code: "invalid-document", message: "Every edge needs an `id`, a `from` and a `to`." });
      continue;
    }
    const edgeId = edge.id;
    const ends = [
      { reference: edge.from, direction: "out" },
      { reference: edge.to, direction: "in" },
    ] as const;
    const resolved: { nodeIndex: number; portIndex: number }[] = [];
    for (const { reference, direction } of ends) {
      const nodeIndex = nodeIndexById.get(reference.node);
      const node = nodeIndex === undefined ? undefined : nodes[nodeIndex];
      if (nodeIndex === undefined || node === undefined) {
        if (!hasNodeIssues) {
          issues.push({
            code: "unknown-node",
            edgeId,
            message: `Edge "${edgeId}" refers to missing node "${reference.node}".`,
          });
        }
        continue;
      }
      const ports = node.component.definition.ports;
      const portIndex = ports.findIndex((port) => port.id === reference.port);
      const port = ports[portIndex];
      if (port === undefined) {
        issues.push({
          code: "unknown-port",
          edgeId,
          nodeId: node.id,
          message: `Edge "${edgeId}": node "${node.id}" has no port "${reference.port}".`,
        });
        continue;
      }
      if (port.direction !== direction) {
        issues.push({
          code: "wrong-port-direction",
          edgeId,
          nodeId: node.id,
          message:
            direction === "out"
              ? `Edge "${edgeId}" starts at "${node.id}.${port.id}", which is not an out port.`
              : `Edge "${edgeId}" ends at "${node.id}.${port.id}", which is not an in port.`,
        });
        continue;
      }
      resolved.push({ nodeIndex, portIndex });
    }
    const [source, target] = resolved;
    if (source !== undefined && target !== undefined) {
      nodes[source.nodeIndex]?.targetsByPort[source.portIndex]?.push(target.nodeIndex);
      nodes[source.nodeIndex]?.edgesByPort[source.portIndex]?.push(edgeIds.length);
      edgeIds.push(edgeId);
    }
  }

  if (issues.length > 0) {
    throw new DesignError(issues);
  }
  return { run: runSettings, nodes, edgeIds };
}

/** Every problem that would stop a design from running. Empty if it can run. */
export function findDesignIssues(
  design: unknown,
  registry: ComponentRegistry,
): readonly DesignIssue[] {
  try {
    buildDesignGraph(design, registry);
    return [];
  } catch (error) {
    if (error instanceof DesignError) {
      return error.issues;
    }
    throw error;
  }
}
