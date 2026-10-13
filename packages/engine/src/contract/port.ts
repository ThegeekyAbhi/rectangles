/** How two connected ports talk. A connection is legal when both ends share a protocol. */
export type Protocol = "sync-request" | "async-publish" | "async-delivery";

export type PortDirection = "in" | "out";

/** A connection point on a component. */
export interface PortSpec {
  readonly id: string;
  readonly direction: PortDirection;
  readonly protocol: Protocol;
  readonly description: string;
}

/** Opaque reference to one of a component's own ports, resolved once in `init`. */
export type PortHandle = number;
