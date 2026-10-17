import type { XYPosition } from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import type { LayoutEdge, LayoutNode, LayoutScope } from "@/modules/whiteboard/lib/auto-layout/elk-graph";
import { layoutScope, positionsFromLayout, toElkGraph } from "@/modules/whiteboard/lib/auto-layout/elk-graph";
import { GRID_SIZE, NODE_HEIGHT, NODE_WIDTH } from "@/modules/whiteboard/lib/component-visuals";
import { CAPTION_GAP, CAPTION_HEIGHT, CAPTION_WIDTH } from "@/modules/whiteboard/lib/diagram-geometry";
import { scaledWebAppDiagram } from "../../../../support/sample-diagrams";

const elk = new ELK();

async function tidy(scope: LayoutScope): Promise<Map<string, XYPosition>> {
  return positionsFromLayout(await elk.layout(toElkGraph(scope)), scope);
}

const at = (x: number, y: number): XYPosition => ({ x, y });
const node = (id: string, componentType: string, position: XYPosition, selected = false): LayoutNode => ({
  id,
  componentType,
  position,
  selected,
});
const edge = (source: string, sourceHandle: string, target: string): LayoutEdge => ({
  id: `${source}->${target}`,
  source,
  sourceHandle,
  target,
  targetHandle: "in",
});

/** The user's board: a client, a load balancer, two API servers and one database, drawn by hand. */
const screenshotBoard: LayoutScope = {
  nodes: [
    node("client", "client", at(96, 272)),
    node("lb", "load-balancer", at(512, 272)),
    node("api", "api-server", at(1056, 112)),
    node("api-2", "api-server", at(1024, 544)),
    node("db", "database", at(1504, 336)),
  ],
  edges: [
    edge("client", "out", "lb"),
    edge("lb", "out", "api"),
    edge("lb", "out", "api-2"),
    edge("api", "database", "db"),
    edge("api-2", "database", "db"),
  ],
};

/** A tile and its caption, as the board draws them. */
function footprint(position: XYPosition) {
  const left = position.x - (CAPTION_WIDTH - NODE_WIDTH) / 2;
  return { left, right: left + CAPTION_WIDTH, top: position.y, bottom: position.y + NODE_HEIGHT + CAPTION_GAP + CAPTION_HEIGHT };
}

function expectNoOverlaps(positions: Map<string, XYPosition>): void {
  const boxes = [...positions.entries()].map(([id, position]) => ({ id, ...footprint(position) }));
  for (const [index, a] of boxes.entries()) {
    for (const b of boxes.slice(index + 1)) {
      const overlaps = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      expect(overlaps, `${a.id} overlaps ${b.id}`).toBe(false);
    }
  }
}

const centreY = (position: XYPosition | undefined) => (position?.y ?? Number.NaN) + NODE_HEIGHT / 2;

describe("tidying the screenshot board", async () => {
  const positions = await tidy(screenshotBoard);
  const of = (id: string) => positions.get(id);

  it("puts every component on the grid, with no tile or caption overlapping another", () => {
    for (const position of positions.values()) {
      expect(position.x % GRID_SIZE).toBe(0);
      expect(position.y % GRID_SIZE).toBe(0);
    }
    expectNoOverlaps(positions);
  });

  it("flows left to right in columns", () => {
    for (const each of screenshotBoard.edges) {
      expect(of(each.target)?.x ?? 0, `${each.source} → ${each.target}`).toBeGreaterThan(of(each.source)?.x ?? 0);
    }
    expect(of("api")?.x).toBe(of("api-2")?.x);
  });

  it("draws the client → load balancer path as one straight line", () => {
    expect(centreY(of("client"))).toBe(centreY(of("lb")));
  });

  it("centres the load balancer between its servers, and the database between them too", () => {
    const middle = (centreY(of("api")) + centreY(of("api-2"))) / 2;
    expect(Math.abs(centreY(of("lb")) - middle)).toBeLessThanOrEqual(GRID_SIZE);
    expect(Math.abs(centreY(of("db")) - middle)).toBeLessThanOrEqual(GRID_SIZE);
  });

  it("keeps the servers in the order the user drew them", () => {
    expect(of("api")?.y ?? 0).toBeLessThan(of("api-2")?.y ?? 0);
  });

  it("stays where the board was, rather than jumping", () => {
    expect(Math.min(...[...positions.values()].map((position) => position.x))).toBe(96);
    expect(Math.min(...[...positions.values()].map((position) => position.y))).toBe(112);
  });

  it("lays the same board out the same way every time", async () => {
    expect(await tidy(screenshotBoard)).toEqual(positions);
  });
});

describe("tidying a selection", () => {
  it("moves only the selected components", async () => {
    const nodes = screenshotBoard.nodes.map((each) => ({ ...each, selected: each.id === "api" || each.id === "db" }));
    const scope = layoutScope(nodes, screenshotBoard.edges);
    expect(scope.nodes.map((each) => each.id).sort()).toEqual(["api", "db"]);
    expect(scope.edges.map((each) => each.id)).toEqual(["api->db"]);
    const positions = await tidy(scope);
    expect([...positions.keys()].sort()).toEqual(["api", "db"]);
  });
});

describe("tidying the sample web app", async () => {
  const scope = layoutScope(
    scaledWebAppDiagram.nodes.map((each) => ({ id: each.id, componentType: each.type, position: each.position })),
    scaledWebAppDiagram.edges.map((each) => ({
      id: each.id,
      source: each.from.node,
      sourceHandle: each.from.port,
      target: each.to.node,
      targetHandle: each.to.port,
    })),
  );
  const positions = await tidy(scope);

  it("places every component without overlaps", () => {
    expect(positions.size).toBe(scaledWebAppDiagram.nodes.length);
    expectNoOverlaps(positions);
  });
});
