import type { ConnectionRule } from "../types.ts";

export const selfConnection: ConnectionRule = {
  id: "self-connection",
  severity: "block",
  applies: ({ proposal }) => proposal.source === proposal.target,
  copy: () => ({
    title: "A component can't connect to itself",
    body: "Each request would arrive back where it started and go round forever.",
  }),
};
