import { isConnectable } from "@rectangles/rules";
import { describe, expect, it } from "vitest";
import {
  boardRuleView,
  checkBoardConnection,
  edgeRuleInputs,
  nodeRuleInputs,
  refusalBetweenHandles,
  toBoardGraph,
  warnedEdges,
} from "@/modules/whiteboard/lib/connection-check";
import type { ComponentNode, ConnectionEdge } from "@/modules/whiteboard/types";

function node(id: string, componentType: string, label = id): ComponentNode {
  return { id, type: "component", position: { x: 0, y: 0 }, data: { componentType, label, config: {} } };
}

const nodes = [
  node("client", "client", "Client"),
  node("lb", "load-balancer", "Load balancer"),
  node("api", "api-server"),
  node("api-2", "api-server"),
  node("db", "database", "Database"),
];
const clientToApi = { source: "client", sourceHandle: "out", target: "api", targetHandle: "in" };

function connectable(connection: Parameters<typeof checkBoardConnection>[0], edges: ConnectionEdge[] = []): boolean {
  return isConnectable(checkBoardConnection(connection, toBoardGraph(nodes, edges)));
}

describe("checkBoardConnection", () => {
  it("accepts an out port joined to an in port of another node", () => {
    expect(connectable(clientToApi)).toBe(true);
  });

  it("refuses a node connected to itself", () => {
    expect(connectable({ source: "lb", sourceHandle: "out", target: "lb", targetHandle: "in" })).toBe(false);
  });

  it("refuses a connection that starts at an in port or ends at an out port", () => {
    expect(connectable({ source: "api", sourceHandle: "in", target: "api-2", targetHandle: "in" })).toBe(false);
    expect(connectable({ source: "client", sourceHandle: "out", target: "lb", targetHandle: "out" })).toBe(false);
  });

  it("refuses ports and nodes that do not exist", () => {
    expect(connectable({ ...clientToApi, sourceHandle: "exit" })).toBe(false);
    expect(connectable({ ...clientToApi, sourceHandle: null })).toBe(false);
    expect(connectable({ ...clientToApi, target: "ghost" })).toBe(false);
  });

  it("refuses a duplicate of an existing connection but allows a second target", () => {
    const existing: ConnectionEdge[] = [{ id: "e1", ...clientToApi }];
    expect(connectable(clientToApi, existing)).toBe(false);
    expect(connectable({ ...clientToApi, target: "api-2" }, existing)).toBe(true);
  });

  it("allows, with a warning, the two connections from the screenshots", () => {
    const graph = toBoardGraph(nodes, []);
    const clientToDatabase = { source: "client", sourceHandle: "out", target: "db", targetHandle: "in" };
    const balancerToDatabase = { source: "lb", sourceHandle: "out", target: "db", targetHandle: "in" };
    expect(checkBoardConnection(clientToDatabase, graph)).toMatchObject({ kind: "warn", ruleId: "direct-database-access" });
    expect(checkBoardConnection(balancerToDatabase, graph)).toMatchObject({ kind: "warn", ruleId: "router-to-database" });
  });
});

describe("refusalBetweenHandles", () => {
  const graph = toBoardGraph(nodes, []);
  const queryPort = { nodeId: "api", id: "database", type: "source" as const };
  const balancerIn = { nodeId: "lb", id: "in", type: "target" as const };

  it("explains a refusal, whichever end the drag started from", () => {
    expect(refusalBetweenHandles(queryPort, balancerIn, graph)?.ruleId).toBe("query-port-to-service");
    expect(refusalBetweenHandles(balancerIn, queryPort, graph)?.ruleId).toBe("query-port-to-service");
  });

  it("finds nothing to explain for an allowed or warned connection", () => {
    const clientOut = { nodeId: "client", id: "out", type: "source" as const };
    expect(refusalBetweenHandles(clientOut, { nodeId: "api", id: "in", type: "target" }, graph)).toBeNull();
    expect(refusalBetweenHandles(clientOut, { nodeId: "db", id: "in", type: "target" }, graph)).toBeNull();
  });
});

describe("rule view and warned edges", () => {
  const edges: ConnectionEdge[] = [
    { id: "fine", ...clientToApi },
    { id: "direct", source: "client", sourceHandle: "out", target: "db", targetHandle: "in" },
  ];

  it("rebuilds the same graph from the flat rule inputs", () => {
    const view = boardRuleView(nodeRuleInputs(nodes), edgeRuleInputs(edges));
    expect(view.graph).toEqual(toBoardGraph(nodes, edges));
    expect(view.edgeIds).toEqual(["fine", "direct"]);
  });

  it("gives the same inputs when only positions or selection change", () => {
    const moved = nodes.map((each) => ({ ...each, position: { x: 99, y: 99 }, selected: true }));
    expect(nodeRuleInputs(moved)).toEqual(nodeRuleInputs(nodes));
    expect(edgeRuleInputs(edges.map((edge) => ({ ...edge, selected: true })))).toEqual(edgeRuleInputs(edges));
  });

  it("marks warned connections already on the board, and only those", () => {
    const warnings = warnedEdges(boardRuleView(nodeRuleInputs(nodes), edgeRuleInputs(edges)));
    expect([...warnings.keys()]).toEqual(["direct"]);
    expect(warnings.get("direct")?.ruleId).toBe("direct-database-access");
  });
});
