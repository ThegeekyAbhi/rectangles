import { describe, expect, it } from "vitest";
import { defaultConfigFor } from "@/modules/whiteboard/lib/component-catalog";
import { EDGE_TYPE } from "@/modules/whiteboard/lib/document-conversion";
import { planScaleOut } from "@/modules/whiteboard/lib/scale-out";
import type { BoardElements, ComponentNode, ConnectionEdge } from "@/modules/whiteboard";

function node(id: string, componentType: string, label: string, x: number, y = 0): ComponentNode {
  return { id, type: "component", position: { x, y }, data: { componentType, label, config: defaultConfigFor(componentType) } };
}

function edge(id: string, source: string, sourceHandle: string, target: string): ConnectionEdge {
  return { id, type: EDGE_TYPE, source, sourceHandle, target, targetHandle: "in", data: { config: {} } };
}

let counter = 0;
const newId = () => `new-${++counter}`;

/** Each connection as `source:handle → target`, for readable expectations. */
function wiring(board: BoardElements): string[] {
  const label = (id: string) => board.nodes.find((candidate) => candidate.id === id)?.data.label ?? id;
  return board.edges.map((each) => `${label(each.source)}:${each.sourceHandle ?? ""} → ${label(each.target)}`).sort();
}

describe("planScaleOut", () => {
  it("puts a load balancer in front of a server a client calls directly, then adds the copy", () => {
    const board: BoardElements = {
      nodes: [node("client", "client", "Client", 0), node("api", "api-server", "API server", 224), node("db", "database", "Database", 448)],
      edges: [edge("e1", "client", "out", "api"), edge("e2", "api", "database", "db")],
    };
    const scaled = planScaleOut(board, "api", newId);
    expect(scaled === null ? [] : wiring(scaled)).toEqual([
      "API server 2:database → Database",
      "API server:database → Database",
      "Client:out → Load balancer",
      "Load balancer:out → API server",
      "Load balancer:out → API server 2",
    ]);
    const byLabel = (label: string) => scaled?.nodes.find((candidate) => candidate.data.label === label);
    // The load balancer takes the server's place; the server and its copy move one column right.
    expect(byLabel("Load balancer")?.position).toEqual({ x: 224, y: 0 });
    expect(byLabel("API server")?.position).toEqual({ x: 448, y: 0 });
    expect(byLabel("API server 2")?.position.x).toBe(448);
    expect(byLabel("API server 2")?.data.config).toEqual(byLabel("API server")?.data.config);
    expect(scaled?.nodes.filter((candidate) => candidate.selected === true).map((each) => each.data.label)).toEqual([
      "API server 2",
    ]);
  });

  it("joins a load balancer that already feeds the server, numbering the copy after the others", () => {
    const board: BoardElements = {
      nodes: [
        node("lb", "load-balancer", "Load balancer", 0),
        node("api", "api-server", "API server", 224, 0),
        node("api-2", "api-server", "API server 2", 224, 176),
      ],
      edges: [edge("e1", "lb", "out", "api"), edge("e2", "lb", "out", "api-2")],
    };
    const scaled = planScaleOut(board, "api-2", newId);
    expect(scaled?.nodes).toHaveLength(4);
    expect(scaled === null ? [] : wiring(scaled)).toContain("Load balancer:out → API server 3");
    // Below the lowest server the load balancer already feeds.
    expect(scaled?.nodes.at(-1)?.position).toEqual({ x: 224, y: 352 });
  });

  it("does nothing for a component that does not scale by copying", () => {
    const board: BoardElements = { nodes: [node("db", "database", "Database", 0)], edges: [] };
    expect(planScaleOut(board, "db", newId)).toBeNull();
  });
});
