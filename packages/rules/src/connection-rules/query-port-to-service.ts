import type { ConnectionRule } from "../types.ts";

export const queryPortToService: ConnectionRule = {
  id: "query-port-to-service",
  severity: "block",
  applies: ({ source, target }) => source.port.protocol === "database-query" && target.port.protocol === "sync-request",
  copy: ({ source, target }) => ({
    title: `${source.node.label}'s database port only sends queries`,
    body: `Only a database can answer a query, and ${target.node.label} handles requests, not queries.`,
    fix: `To send traffic to ${source.node.label}, connect into its in port instead.`,
  }),
};
