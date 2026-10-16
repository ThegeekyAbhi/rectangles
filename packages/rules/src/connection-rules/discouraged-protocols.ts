import { compatibilityOf } from "../ports/protocol-compatibility.ts";
import type { ConnectionRule } from "../types.ts";

/** The fallback for a discouraged pair of protocols that no more specific rule explains. */
export const discouragedProtocols: ConnectionRule = {
  id: "discouraged-protocols",
  severity: "warn",
  applies: ({ source, target }) => compatibilityOf(source.port.protocol, target.port.protocol) === "discouraged",
  copy: ({ source, target }) => ({
    title: `${source.node.label} → ${target.node.label} is unusual`,
    body: `Real systems rarely connect these directly. Rectangles will still run it. ${target.node.label}'s port expects: ${target.port.description}`,
  }),
};
