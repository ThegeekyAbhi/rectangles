import type { ConfigFields } from "./config-field.ts";

/**
 * How two connected ports talk. A connection is legal when both ends share a protocol.
 * `database-query` behaves exactly like `sync-request`; it is separate so that only
 * components with a database port can reach a database.
 */
export type Protocol = "sync-request" | "database-query" | "async-publish" | "async-delivery";

export type PortDirection = "in" | "out";

/** A connection point on a component. */
export interface PortSpec {
  readonly id: string;
  readonly direction: PortDirection;
  readonly protocol: Protocol;
  readonly description: string;
  /**
   * Settings each connection leaving this port carries, for example a load balancer's
   * per-target `weight`. Out ports only. The inspector shows them when a connection is
   * selected, and components read them with `SetupContext.connections`.
   */
  readonly connectionFields?: ConfigFields;
}

/** Opaque reference to one of a component's own ports, resolved once in `init`. */
export type PortHandle = number;
