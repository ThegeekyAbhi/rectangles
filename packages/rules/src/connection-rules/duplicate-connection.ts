import type { ConnectionRule } from "../types.ts";

export const duplicateConnection: ConnectionRule = {
  id: "duplicate-connection",
  severity: "block",
  applies: ({ proposal, graph }) =>
    graph.connections.some(
      (connection) =>
        connection.source === proposal.source &&
        connection.sourcePort === proposal.sourcePort &&
        connection.target === proposal.target &&
        connection.targetPort === proposal.targetPort,
    ),
  copy: ({ source, target }) => ({
    title: "These are already connected",
    body: `${source.node.label} already sends to ${target.node.label} from this port. Select that connection to change its settings.`,
  }),
};
