import { describe, expect, it } from "vitest";
import { isWellFormedConnection } from "@/modules/whiteboard/lib/connection-check";
import type { ComponentNode, ConnectionEdge } from "@/modules/whiteboard/types";

function node(id: string, componentType: string): ComponentNode {
  return { id, type: "component", position: { x: 0, y: 0 }, data: { componentType, label: id, config: {} } };
}

const nodes = [node("client", "client"), node("api", "api-server"), node("api-2", "api-server")];
const clientToApi = { source: "client", sourceHandle: "out", target: "api", targetHandle: "in" };

describe("isWellFormedConnection", () => {
  it("accepts an out port joined to an in port of another node", () => {
    expect(isWellFormedConnection(clientToApi, nodes, [])).toBe(true);
  });

  it("refuses a node connected to itself", () => {
    const loop = { source: "api", sourceHandle: "in", target: "api", targetHandle: "in" };
    expect(isWellFormedConnection(loop, nodes, [])).toBe(false);
  });

  it("refuses a connection that starts at an in port or ends at an out port", () => {
    const fromInPort = { source: "api", sourceHandle: "in", target: "api-2", targetHandle: "in" };
    const toOutPort = { source: "client", sourceHandle: "out", target: "client", targetHandle: "out" };
    expect(isWellFormedConnection(fromInPort, nodes, [])).toBe(false);
    expect(isWellFormedConnection(toOutPort, nodes, [])).toBe(false);
  });

  it("refuses ports and nodes that do not exist", () => {
    expect(isWellFormedConnection({ ...clientToApi, sourceHandle: "exit" }, nodes, [])).toBe(false);
    expect(isWellFormedConnection({ ...clientToApi, sourceHandle: null }, nodes, [])).toBe(false);
    expect(isWellFormedConnection({ ...clientToApi, target: "ghost" }, nodes, [])).toBe(false);
  });

  it("refuses a duplicate of an existing connection but allows a second target", () => {
    const existing: ConnectionEdge[] = [{ id: "e1", ...clientToApi }];
    expect(isWellFormedConnection(clientToApi, nodes, existing)).toBe(false);
    expect(isWellFormedConnection({ ...clientToApi, target: "api-2" }, nodes, existing)).toBe(true);
  });
});
