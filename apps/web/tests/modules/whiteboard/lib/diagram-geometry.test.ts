import type { ProjectDocument } from "@rectangles/schema";
import { describe, expect, it } from "vitest";
import { NODE_HEIGHT, NODE_WIDTH } from "@/modules/whiteboard/lib/component-visuals";
import {
  CAPTION_GAP,
  CAPTION_HEIGHT,
  CAPTION_WIDTH,
  describeDiagram,
  diagramBounds,
  diagramEdges,
  diagramPorts,
  diagramProblems,
  IN_PORT_WIDTH,
  OUT_PORT_DIAMETER,
} from "@/modules/whiteboard/lib/diagram-geometry";
import { clientAndServersDiagram as twoClients, scaledWebAppDiagram as webApp } from "../../../support/sample-diagrams";

/** The numbers a path's `M x,y` starts at and the last two numbers it ends at. */
function endpoints(path: string) {
  const numbers = (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  return { start: numbers.slice(0, 2), end: numbers.slice(-2) };
}

describe("sample diagrams", () => {
  it("are valid documents", () => {
    expect(twoClients.nodes).toHaveLength(4);
    expect(webApp.nodes).toHaveLength(12);
  });
});

describe("diagramBounds", () => {
  it("covers every tile and the caption under it, with a margin", () => {
    const bounds = diagramBounds(twoClients);
    for (const node of twoClients.nodes) {
      const captionLeft = node.position.x + NODE_WIDTH / 2 - CAPTION_WIDTH / 2;
      expect(bounds.x).toBeLessThan(captionLeft);
      expect(bounds.y).toBeLessThan(node.position.y);
      expect(bounds.x + bounds.width).toBeGreaterThan(captionLeft + CAPTION_WIDTH);
      expect(bounds.y + bounds.height).toBeGreaterThan(node.position.y + NODE_HEIGHT + CAPTION_GAP + CAPTION_HEIGHT);
    }
  });

  it("has a size for an empty diagram", () => {
    const bounds = diagramBounds({ schemaVersion: 3, nodes: [], edges: [] });
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
  });
});

describe("diagramEdges", () => {
  it("runs each edge from the outer edge of the out port to the outer edge of the in port", () => {
    const edges = diagramEdges(twoClients);
    expect(edges).toHaveLength(3);

    const client = twoClients.nodes.find((node) => node.id === "client-2")!;
    const api = twoClients.nodes.find((node) => node.id === "api")!;
    const { start, end } = endpoints(edges.find((edge) => edge.id === "client-2-to-api")!.path);
    expect(start).toEqual([client.position.x + NODE_WIDTH + OUT_PORT_DIAMETER / 2, client.position.y + NODE_HEIGHT / 2]);
    expect(end).toEqual([api.position.x - IN_PORT_WIDTH / 2, api.position.y + NODE_HEIGHT / 2]);
  });

  it("draws every edge of the larger architecture, including those meeting types not simulated yet", () => {
    const edges = diagramEdges(webApp);
    expect(edges).toHaveLength(webApp.edges.length);
    for (const edge of edges) {
      expect(edge.path).not.toMatch(/NaN|undefined/);
    }
  });

  it("leaves out an edge to a node that is not in the diagram", () => {
    const document: ProjectDocument = {
      ...twoClients,
      edges: [{ id: "lost", from: { node: "client", port: "out" }, to: { node: "gone", port: "in" }, config: {} }],
    };
    expect(diagramEdges(document)).toEqual([]);
  });
});

describe("diagramPorts", () => {
  it("draws the declared ports of known types, as the board does", () => {
    const keys = diagramPorts(twoClients).map((port) => port.key);
    expect(keys.sort()).toEqual(["api-2:in", "api:in", "client-2:out", "client:out"]);
  });

  it("meets a type not simulated yet in the middle of each side an edge uses", () => {
    const ports = diagramPorts(webApp);
    const workers = webApp.nodes.find((node) => node.id === "workers")!;
    expect(ports.filter((port) => port.key.startsWith("workers:"))).toEqual([
      { key: "workers:in", direction: "in", x: workers.position.x, y: workers.position.y + NODE_HEIGHT / 2 },
      { key: "workers:out", direction: "out", x: workers.position.x + NODE_WIDTH, y: workers.position.y + NODE_HEIGHT / 2 },
    ]);
  });
});

describe("diagramProblems", () => {
  it("finds nothing in a diagram the engine can simulate", () => {
    expect(diagramProblems(twoClients)).toEqual([]);
  });

  it("names types not simulated yet and ports a component does not have, once each", () => {
    const problems = diagramProblems(webApp);
    expect(problems).toEqual(
      expect.arrayContaining([
        '"cache" is not simulated yet.',
        '"database" is not simulated yet.',
        expect.stringMatching(/API server has no "out" port yet/),
      ]),
    );
    expect(new Set(problems).size).toBe(problems.length);
  });

  it("names an edge to a missing node", () => {
    const document: ProjectDocument = {
      ...twoClients,
      edges: [{ id: "lost", from: { node: "client", port: "out" }, to: { node: "gone", port: "in" }, config: {} }],
    };
    expect(diagramProblems(document)).toEqual(['An edge refers to "gone", which is not in the diagram.']);
  });
});

describe("describeDiagram", () => {
  it("says who sends to whom", () => {
    expect(describeDiagram(twoClients)).toBe(
      "Architecture diagram. Client sends to API server 2, API server. Client 2 sends to API server.",
    );
  });
});
