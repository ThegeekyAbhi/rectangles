import { describe, expect, it } from "vitest";
import { isSameDesign } from "@/modules/simulation/lib/is-same-design";
import type { BoardElements, ComponentNode } from "@/modules/whiteboard";

const client: ComponentNode = {
  id: "client",
  type: "component",
  position: { x: 0, y: 0 },
  data: { componentType: "client", label: "Client", config: { ratePerSecond: 100 } },
};
const api: ComponentNode = {
  id: "api",
  type: "component",
  position: { x: 400, y: 0 },
  data: { componentType: "api-server", label: "API server", config: { workers: 50 } },
};
const board: BoardElements = {
  nodes: [client, api],
  edges: [{ id: "e1", source: "client", sourceHandle: "out", target: "api", targetHandle: "in" }],
};

describe("isSameDesign", () => {
  it("ignores moving, renaming and selecting", () => {
    const moved = { ...api, position: { x: 500, y: 80 }, selected: true, data: { ...api.data, label: "Checkout" } };
    expect(isSameDesign(board, { ...board, nodes: [client, moved] })).toBe(true);
  });

  it("notices a changed setting", () => {
    const resized = { ...api, data: { ...api.data, config: { workers: 100 } } };
    expect(isSameDesign(board, { ...board, nodes: [client, resized] })).toBe(false);
  });

  it("notices added and removed components and connections", () => {
    expect(isSameDesign(board, { ...board, nodes: [client] })).toBe(false);
    expect(isSameDesign(board, { ...board, edges: [] })).toBe(false);
  });

  it("notices a connection that now ends somewhere else", () => {
    const rewired = [{ ...board.edges[0]!, target: "client" }];
    expect(isSameDesign(board, { ...board, edges: rewired })).toBe(false);
  });
});
