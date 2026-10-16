import type { ConnectionRule } from "../types.ts";

/** A component that forwards requests (it has an in port), such as a load balancer, sending to a database. */
export const routerToDatabase: ConnectionRule = {
  id: "router-to-database",
  severity: "warn",
  applies: ({ source, target }) =>
    source.port.protocol === "sync-request" &&
    target.port.protocol === "database-query" &&
    source.definition.ports.some((port) => port.direction === "in"),
  copy: ({ source, target }) => ({
    title: `${source.node.label} rarely sits in front of a database`,
    body:
      "HTTP load balancers can't speak a database's protocol. TCP ones (like HAProxy) do, in front of read replicas, " +
      "but each database here holds its own data, so writes would land on different copies.",
    fix: `Usual shape: ${source.node.label} → API servers → ${target.node.label}.`,
  }),
};
