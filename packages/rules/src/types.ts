import type { ComponentDefinition, PortSpec } from "@rectangles/engine";

/** A component on the board, as the rules see it. */
export interface BoardNode {
  readonly id: string;
  /** Component type, as registered in the engine. */
  readonly type: string;
  /** The name the user gave it. Used in messages so they read like the board. */
  readonly label: string;
}

/** A connection from one node's out port to another node's in port. */
export interface BoardConnection {
  readonly source: string;
  readonly sourcePort: string;
  readonly target: string;
  readonly targetPort: string;
}

export interface BoardGraph {
  readonly nodes: readonly BoardNode[];
  readonly connections: readonly BoardConnection[];
}

/** One end of a proposed connection, resolved against the engine's registry. */
export interface ConnectionEnd {
  readonly node: BoardNode;
  readonly definition: ComponentDefinition;
  readonly port: PortSpec;
}

/** Everything a rule may look at to judge a proposed connection. */
export interface ConnectionContext {
  readonly proposal: BoardConnection;
  readonly source: ConnectionEnd;
  readonly target: ConnectionEnd;
  readonly graph: BoardGraph;
}

/**
 * - `block`: the connection cannot work, so it is not made.
 * - `warn`: it works and is simulated, but real systems rarely do it.
 */
export type Severity = "block" | "warn";

/** What the user reads: a one-line title, why, and optionally what to do instead. */
export interface RuleCopy {
  readonly title: string;
  readonly body: string;
  readonly fix?: string;
}

export interface ConnectionRule {
  /** kebab-case, stable: muted rules are stored by id. */
  readonly id: string;
  readonly severity: Severity;
  applies(context: ConnectionContext): boolean;
  copy(context: ConnectionContext): RuleCopy;
}

/**
 * - `ok`: connect silently.
 * - `invalid`: not a connection at all (unknown node or port, wrong direction). Refused
 *   without a message; the canvas never offers these.
 * - `warn` / `block`: a rule applies; its copy explains why.
 */
export type ConnectionVerdict =
  | { readonly kind: "ok" }
  | { readonly kind: "invalid" }
  | ({ readonly kind: Severity; readonly ruleId: string } & RuleCopy);
