import type { ProjectDocument } from "@rectangles/schema";
import { describe, expect, it } from "vitest";
import {
  documentToElements,
  elementsToDocument,
  isSameDocument,
} from "@/modules/whiteboard/lib/document-conversion";
import { defaultConfigFor } from "@/modules/whiteboard/lib/component-catalog";

const document: ProjectDocument = {
  schemaVersion: 2,
  nodes: [
    {
      id: "client",
      type: "client",
      label: "Shoppers",
      position: { x: 16, y: 32 },
      config: { ...defaultConfigFor("client"), ratePerSecond: 750 },
    },
    {
      id: "api",
      type: "api-server",
      label: "Checkout API",
      position: { x: 320, y: 32 },
      config: defaultConfigFor("api-server"),
    },
  ],
  edges: [{ id: "e1", from: { node: "client", port: "out" }, to: { node: "api", port: "in" }, config: {} }],
};

/** A client calling a load balancer whose one connection to the API server has weight 3. */
const balanced: ProjectDocument = {
  ...document,
  nodes: [
    ...document.nodes,
    { id: "lb", type: "load-balancer", label: "LB", position: { x: 160, y: 32 }, config: defaultConfigFor("load-balancer") },
  ],
  edges: [
    { id: "e1", from: { node: "client", port: "out" }, to: { node: "lb", port: "in" }, config: {} },
    { id: "e2", from: { node: "lb", port: "out" }, to: { node: "api", port: "in" }, config: { weight: 3 } },
  ],
};

describe("document conversion", () => {
  it("round-trips a document without losing anything", () => {
    const { nodes, edges } = documentToElements(document);
    expect(elementsToDocument(nodes, edges)).toEqual(document);
  });

  it("maps ports to edge handles", () => {
    expect(documentToElements(document).edges[0]).toMatchObject({
      source: "client",
      sourceHandle: "out",
      target: "api",
      targetHandle: "in",
      type: "connection",
    });
  });

  it("fills in defaults for fields a saved config lacks", () => {
    const sparse = { ...document, nodes: [{ ...document.nodes[1]!, config: { instances: 4 } }], edges: [] };
    expect(documentToElements(sparse).nodes[0]?.data.config).toEqual({
      ...defaultConfigFor("api-server"),
      instances: 4,
    });
  });

  it("keeps an invalid saved config as it is, for the inspector to report", () => {
    const invalid = { ...document, nodes: [{ ...document.nodes[1]!, config: { instances: -3 } }], edges: [] };
    expect(documentToElements(invalid).nodes[0]?.data.config).toEqual({ instances: -3 });
  });

  it("keeps nodes of a type the engine does not know", () => {
    const unknown = {
      ...document,
      nodes: [{ id: "x", type: "mainframe", label: "Mainframe", position: { x: 0, y: 0 }, config: { a: 1 } }],
      edges: [],
    };
    const { nodes, edges } = documentToElements(unknown);
    expect(elementsToDocument(nodes, edges)).toEqual(unknown);
  });

  it("round-trips each connection's settings", () => {
    const { nodes, edges } = documentToElements(balanced);
    expect(edges[1]?.data?.config).toEqual({ weight: 3 });
    expect(elementsToDocument(nodes, edges)).toEqual(balanced);
  });

  it("fills in defaults for connection settings a saved edge lacks", () => {
    const sparse = { ...balanced, edges: [{ ...balanced.edges[1]!, config: {} }] };
    expect(documentToElements(sparse).edges[0]?.data?.config).toEqual({ weight: 1 });
  });

  it("treats a changed connection setting as a different document", () => {
    const before = documentToElements(balanced);
    const edges = before.edges.map((edge) =>
      edge.id === "e2" ? { ...edge, data: { config: { weight: 5 } } } : edge,
    );
    expect(isSameDocument(before, { nodes: before.nodes, edges })).toBe(false);
  });

  it("leaves editing-only state out of the document", () => {
    const { nodes, edges } = documentToElements(document);
    const editing = nodes.map((node) => ({
      ...node,
      selected: true,
      dragging: true,
      measured: { width: 200, height: 72 },
    }));
    expect(elementsToDocument(editing, edges)).toEqual(document);
  });
});

describe("isSameDocument", () => {
  const elements = documentToElements(document);

  it("ignores selection and measured sizes", () => {
    const selected = {
      nodes: elements.nodes.map((node) => ({ ...node, selected: true, measured: { width: 1, height: 1 } })),
      edges: elements.edges.map((edge) => ({ ...edge, selected: true })),
    };
    expect(isSameDocument(elements, selected)).toBe(true);
  });

  it("notices a moved node, changed data, and added or rewired edges", () => {
    const [first, second] = elements.nodes;
    const moved = { ...elements, nodes: [{ ...first!, position: { x: 17, y: 32 } }, second!] };
    const renamed = { ...elements, nodes: [{ ...first!, data: { ...first!.data, label: "Users" } }, second!] };
    const disconnected = { ...elements, edges: [] };
    const rewired = { ...elements, edges: [{ ...elements.edges[0]!, target: "client" }] };

    for (const changed of [moved, renamed, disconnected, rewired]) {
      expect(isSameDocument(elements, changed)).toBe(false);
    }
  });
});
