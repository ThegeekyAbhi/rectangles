import type { ConnectionRule } from "../types.ts";

/** A traffic source (it originates requests) sending straight to a database. */
export const directDatabaseAccess: ConnectionRule = {
  id: "direct-database-access",
  severity: "warn",
  applies: ({ source, target }) =>
    source.port.protocol === "sync-request" &&
    target.port.protocol === "database-query" &&
    source.definition.expectedRequests !== undefined,
  copy: ({ source, target }) => ({
    title: "Clients rarely talk to a database directly",
    body:
      "In production an API server sits in between. It checks what users send, keeps the database password off their devices, and shares a few pooled connections among thousands of users. " +
      "Rectangles will still run this, treating each request as one query.",
    fix: `Put an API server between ${source.node.label} and ${target.node.label}.`,
  }),
};
