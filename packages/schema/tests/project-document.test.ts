import { describe, expect, it } from "vitest";
import type { ProjectDocument } from "../src/project-document.ts";
import { createEmptyDocument, parseProjectDocument } from "../src/project-document.ts";

const document: ProjectDocument = {
  schemaVersion: 1,
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
  edges: [{ id: "e1", from: { node: "client", port: "out" }, to: { node: "api", port: "in" } }],
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
    expect(messageFor({ ...document, schemaVersion: 2 })).toMatch(/newer version of Rectangles/);
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
    ["an edge without a target", { ...document, edges: [{ id: "e", from: { node: "a", port: "out" } }] }],
    ["an unknown top-level field", { ...document, extra: true }],
  ])("refuses %s as damaged", (_name, value) => {
    expect(messageFor(value)).toMatch(/data is damaged/);
  });
});
