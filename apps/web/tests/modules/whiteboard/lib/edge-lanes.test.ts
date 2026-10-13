import { describe, expect, it } from "vitest";
import { GRID_SIZE, NODE_WIDTH } from "@/modules/whiteboard/lib/component-visuals";
import { assignEdgeLanes } from "@/modules/whiteboard/lib/edge-lanes";
import type { ComponentNode, ConnectionEdge } from "@/modules/whiteboard/types";

function node(id: string, componentType: string, x: number, y: number): ComponentNode {
  return {
    id,
    type: "component",
    position: { x, y },
    data: { componentType, label: id, config: {} },
  };
}

const client = (id: string, x: number, y: number) => node(id, "client", x, y);
const server = (id: string, x: number, y: number) => node(id, "api-server", x, y);

function edge(source: string, target: string): ConnectionEdge {
  return { id: `${source}-${target}`, source, sourceHandle: "out", target, targetHandle: "in" };
}

/** Two clients on the left, two API servers on the right, 400 apart. */
const grid = [
  client("client-1", 0, 0),
  client("client-2", 0, 160),
  server("api-1", 400, 0),
  server("api-2", 400, 160),
];
const MIDDLE = (NODE_WIDTH + 400) / 2;

describe("assignEdgeLanes", () => {
  it("gives two crossing edges their own lanes", () => {
    const lanes = assignEdgeLanes(grid, [edge("client-1", "api-2"), edge("client-2", "api-1")]);
    expect(lanes.get("client-1-api-2")).toBe(MIDDLE - GRID_SIZE / 2);
    expect(lanes.get("client-2-api-1")).toBe(MIDDLE + GRID_SIZE / 2);
  });

  it("keeps the edges of a fork in one lane", () => {
    const lanes = assignEdgeLanes(grid, [edge("client-1", "api-1"), edge("client-1", "api-2")]);
    expect(lanes.get("client-1-api-1")).toBe(MIDDLE);
    expect(lanes.get("client-1-api-2")).toBe(MIDDLE);
  });

  it("separates every source when each client reaches both servers", () => {
    const lanes = assignEdgeLanes(grid, [
      edge("client-1", "api-1"),
      edge("client-1", "api-2"),
      edge("client-2", "api-1"),
      edge("client-2", "api-2"),
    ]);
    expect(lanes.get("client-1-api-1")).toBe(lanes.get("client-1-api-2"));
    expect(lanes.get("client-2-api-1")).toBe(lanes.get("client-2-api-2"));
    expect(lanes.get("client-1-api-1")).not.toBe(lanes.get("client-2-api-1"));
  });

  it("leaves a level edge on the default route", () => {
    const lanes = assignEdgeLanes(grid, [edge("client-1", "api-1"), edge("client-2", "api-1")]);
    expect(lanes.has("client-1-api-1")).toBe(false);
    expect(lanes.get("client-2-api-1")).toBe(MIDDLE);
  });

  it("bends the upper of two downward edges further right, so they do not cross", () => {
    const nodes = [
      client("upper", 0, 0),
      client("lower", 0, 160),
      server("upper-target", 400, 320),
      server("lower-target", 400, 480),
    ];
    const lanes = assignEdgeLanes(nodes, [edge("upper", "upper-target"), edge("lower", "lower-target")]);
    expect(lanes.get("upper-upper-target")).toBe(MIDDLE + GRID_SIZE / 2);
    expect(lanes.get("lower-lower-target")).toBe(MIDDLE - GRID_SIZE / 2);
  });

  it("does not move lanes that are already apart", () => {
    const nodes = [
      client("near", 0, 0),
      client("far", -200, 160),
      server("api-1", 400, 160),
      server("api-2", 400, 0),
    ];
    const lanes = assignEdgeLanes(nodes, [edge("near", "api-1"), edge("far", "api-2")]);
    expect(lanes.get("near-api-1")).toBe(MIDDLE);
    expect(lanes.get("far-api-2")).toBe(MIDDLE - 100);
  });

  it("keeps lanes clear of the nodes when the gap is narrow", () => {
    const gap = GRID_SIZE * 2.5;
    const nodes = [
      client("client-1", 0, 0),
      client("client-2", 0, 160),
      server("api-1", NODE_WIDTH + gap, 0),
      server("api-2", NODE_WIDTH + gap, 160),
    ];
    const lanes = assignEdgeLanes(nodes, [edge("client-1", "api-2"), edge("client-2", "api-1")]);
    expect(lanes.get("client-1-api-2")).toBe(NODE_WIDTH + GRID_SIZE);
    expect(lanes.get("client-2-api-1")).toBe(NODE_WIDTH + gap - GRID_SIZE);
  });

  it("leaves an edge that runs backwards on the default route", () => {
    const nodes = [client("client-1", 0, 0), server("api-1", -400, 160)];
    expect(assignEdgeLanes(nodes, [edge("client-1", "api-1")]).size).toBe(0);
  });

  it("ignores an edge whose node or port is missing", () => {
    const edges = [edge("client-1", "gone"), { ...edge("client-1", "api-2"), targetHandle: "nope" }];
    expect(assignEdgeLanes(grid, edges).size).toBe(0);
  });

  it("returns the same result for the same board without recomputing", () => {
    const edges = [edge("client-1", "api-2")];
    expect(assignEdgeLanes(grid, edges)).toBe(assignEdgeLanes(grid, edges));
  });
});
