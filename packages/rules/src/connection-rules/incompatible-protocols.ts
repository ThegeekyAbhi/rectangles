import { compatibilityOf } from "../ports/protocol-compatibility.ts";
import type { ConnectionRule } from "../types.ts";

/** The fallback for any pair of protocols that cannot talk and has no more specific rule. */
export const incompatibleProtocols: ConnectionRule = {
  id: "incompatible-protocols",
  severity: "block",
  applies: ({ source, target }) => compatibilityOf(source.port.protocol, target.port.protocol) === "incompatible",
  copy: ({ source, target }) => ({
    title: `${target.node.label} can't understand what ${source.node.label} sends here`,
    body: `This port sends: ${source.port.description} ${target.node.label}'s port expects: ${target.port.description}`,
  }),
};
