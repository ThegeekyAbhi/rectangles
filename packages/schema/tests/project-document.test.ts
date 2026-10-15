import { describe, expect, it } from "vitest";
import type { ProjectDocument } from "../src/project-document.ts";
import { createEmptyDocument, parseProjectDocument } from "../src/project-document.ts";

const document: ProjectDocument = {
  schemaVersion: 2,
  nodes: [
    {
      id: "client",
      type: "client",
      label: "Client",
      position: { x: 0, y: 40.5 },
      config: { pattern: "steady", ratePerSecond: 100 },
    },
    { id: "api", type: "api-server", label: "API server", position: { x: 320, y: 40 }, config: {} },
  ],
  edges: [{ id: "e1", from: { node: "client", port: "out" }, to: { node: "api", port: "in" }, config: { weight: 3 } }],
};

function messageFor(value: unknown): string {
  const result = parseProjectDocument(value);
  return result.ok ? "" : result.message;
}

describe("parseProjectDocument", () => {
  it("accepts a valid document unchanged", () => {
    expect(parseProjectDocument(document)).toEqual({ ok: true, document });
  });

  it("accepts an empty document", () => {
    expect(parseProjectDocument(createEmptyDocument())).toMatchObject({ ok: true });
  });

  it("refuses a document from a newer version, saying so", () => {
    expect(messageFor({ ...document, schemaVersion: 3 })).toMatch(/newer version of Rectangles/);
  });

  it("brings a version 1 document forward, giving every edge empty settings", () => {
    const edges = document.edges.map((edge) => ({ id: edge.id, from: edge.from, to: edge.to }));
    expect(parseProjectDocument({ ...document, schemaVersion: 1, edges })).toEqual({
      ok: true,
      document: { ...document, edges: edges.map((edge) => ({ ...edge, config: {} })) },
    });
  });

  it.each([
    ["nothing", undefined],
    ["a string", "{}"],
    ["a missing version", { nodes: [], edges: [] }],
    ["an old version", { ...document, schemaVersion: 0 }],
    ["nodes that are not a list", { ...document, nodes: {} }],
    ["a node without a position", { ...document, nodes: [{ id: "a", type: "client", label: "", config: {} }] }],
    ["an empty node id", { ...document, nodes: [{ ...document.nodes[0], id: "" }] }],
    ["a non-numeric position", { ...document, nodes: [{ ...document.nodes[0], position: { x: "0", y: 0 } }] }],
    ["a nested config value", { ...document, nodes: [{ ...document.nodes[0], config: { a: { b: 1 } } }] }],
    ["an edge without a target", { ...document, edges: [{ id: "e", from: { node: "a", port: "out" }, config: {} }] }],
    ["an edge without settings", { ...document, edges: [{ ...document.edges[0], config: undefined }] }],
    ["an unknown top-level field", { ...document, extra: true }],
  ])("refuses %s as damaged", (_name, value) => {
    expect(messageFor(value)).toMatch(/data is damaged/);
  });
});
