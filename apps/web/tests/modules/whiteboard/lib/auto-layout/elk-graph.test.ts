import { describe, expect, it } from "vitest";
import type { LayoutScope } from "@/modules/whiteboard/lib/auto-layout/elk-graph";
import { LAYOUT_OPTIONS, positionsFromLayout, toElkGraph } from "@/modules/whiteboard/lib/auto-layout/elk-graph";
import { GRID_SIZE, NODE_HEIGHT } from "@/modules/whiteboard/lib/component-visuals";
import { CAPTION_WIDTH } from "@/modules/whiteboard/lib/diagram-geometry";

const scope: LayoutScope = {
  nodes: [
    { id: "api", componentType: "api-server", position: { x: 300, y: 200 } },
    { id: "client", componentType: "client", position: { x: 40, y: 100 } },
  ],
  edges: [{ id: "e1", source: "client", sourceHandle: "out", target: "api", targetHandle: "in" }],
};

describe("toElkGraph", () => {
  const graph = toElkGraph(scope);

  it("lays out left to right with the board's options", () => {
    expect(graph.layoutOptions).toEqual(LAYOUT_OPTIONS);
    expect(LAYOUT_OPTIONS["elk.direction"]).toBe("RIGHT");
  });

  it("gives components in the board's top-to-bottom order, so ELK keeps it", () => {
    expect(graph.children?.map((child) => child.id)).toEqual(["client", "api"]);
  });

  it("reserves room for the caption and puts ports where the tile draws them", () => {
    const api = graph.children?.find((child) => child.id === "api");
    expect(api?.width).toBe(CAPTION_WIDTH);
    const portIn = api?.ports?.find((port) => port.id === "api::in");
    const portOut = api?.ports?.find((port) => port.id === "api::database");
    expect(portIn).toMatchObject({ x: 0, y: NODE_HEIGHT / 2 });
    expect(portOut).toMatchObject({ x: CAPTION_WIDTH, y: NODE_HEIGHT / 2 });
  });

  it("connects edges to ports, falling back to the component for an unknown port", () => {
    expect(graph.edges?.[0]).toMatchObject({ sources: ["client::out"], targets: ["api::in"] });
    const unknown = toElkGraph({ ...scope, edges: [{ ...scope.edges[0]!, targetHandle: "nowhere" }] });
    expect(unknown.edges?.[0]?.targets).toEqual(["api"]);
  });
});

describe("positionsFromLayout", () => {
  it("snaps to the grid and keeps the group's top-left where it was", () => {
    const layout = {
      id: "board",
      children: [
        { id: "client", x: 3, y: 50 },
        { id: "api", x: 275, y: 7 },
      ],
    };
    const positions = positionsFromLayout(layout, scope);
    for (const position of positions.values()) {
      expect(position.x % GRID_SIZE).toBe(0);
      expect(position.y % GRID_SIZE).toBe(0);
    }
    // The scope's top-left was (40, 100), which snaps to (48, 96).
    expect(Math.min(...[...positions.values()].map((position) => position.x))).toBe(48);
    expect(Math.min(...[...positions.values()].map((position) => position.y))).toBe(96);
  });
});
