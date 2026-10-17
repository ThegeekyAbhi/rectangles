import { describe, expect, it } from "vitest";
import type { ProjectDocument } from "../src/project-document.ts";
import { createEmptyDocument, parseProjectDocument } from "../src/project-document.ts";

const document: ProjectDocument = {
  schemaVersion: 3,
  nodes: [
    {
      id: "client",
      type: "client",
      label: "Client",
      position: { x: 0, y: 40.5 },
      config: { pattern: "steady", ratePerSecond: 100 },
    },
    { id: "api", type: "api-server", label: "API server", position: { x: 320, y: 40 }, config: { workers: 50 } },
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
    expect(messageFor({ ...document, schemaVersion: 4 })).toMatch(/newer version of Rectangles/);
  });

  it("brings a version 1 document forward, giving every edge empty settings", () => {
    const edges = document.edges.map((edge) => ({ id: edge.id, from: edge.from, to: edge.to }));
    const result = parseProjectDocument({ ...document, schemaVersion: 1, edges });
    expect(result).toMatchObject({ ok: true, document: { schemaVersion: 3, edges: edges.map((edge) => ({ ...edge, config: {} })) } });
  });

  describe("version 2 → 3: an API server becomes one server", () => {
    const apiServerSavedAs = (config: Record<string, unknown>) => {
      const result = parseProjectDocument({
        ...document,
        schemaVersion: 2,
        nodes: [{ ...document.nodes[1], config }],
      });
      return result.ok ? result.document.nodes[0]?.config : undefined;
    };

    it("turns slots into workers and service time into waiting with no CPU, so it runs as before", () => {
      expect(apiServerSavedAs({ instances: 3, concurrency: 40, serviceTimeMs: 25, serviceTimeDistribution: "constant", queueLimit: 7 })).toEqual({
        size: "medium",
        workers: 120,
        cpuTimeMs: 0,
        otherWaitMs: 25,
        timeDistribution: "constant",
        queueLimit: 7,
      });
    });

    it("uses version 2's defaults for settings that were left out", () => {
      expect(apiServerSavedAs({})).toEqual({
        size: "medium",
        workers: 100,
        cpuTimeMs: 0,
        otherWaitMs: 20,
        timeDistribution: "exponential",
      });
    });

    it("carries a value that was not a number over, for validation to report", () => {
      expect(apiServerSavedAs({ instances: "two" })).toMatchObject({ workers: "two" });
    });

    it("repairs a newer document that kept old settings, keeping what the user chose over filled-in defaults", () => {
      const result = parseProjectDocument({
        ...document,
        nodes: [
          {
            ...document.nodes[1],
            config: { size: "medium", workers: 50, cpuTimeMs: 2, otherWaitMs: 18, instances: 3, concurrency: 40, serviceTimeMs: 25 },
          },
        ],
      });
      expect(result.ok && result.document.nodes[0]?.config).toEqual({
        size: "medium",
        workers: 120,
        cpuTimeMs: 0,
        otherWaitMs: 25,
        timeDistribution: "exponential",
      });
    });

    it("leaves a current API server without old settings untouched", () => {
      expect(parseProjectDocument(document)).toEqual({ ok: true, document });
    });

    it("leaves other components alone", () => {
      const result = parseProjectDocument({ ...document, schemaVersion: 2 });
      expect(result.ok && result.document.nodes[0]?.config).toEqual(document.nodes[0]?.config);
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
