import { describe, expect, it } from "vitest";
import { registry } from "../../src/registry.ts";
import { buildClientApiServerDesign } from "../support/client-api-server-design.ts";
import type { DesignIssueCode } from "../../src/kernel/design-graph.ts";
import { buildDesignGraph, DesignError, findDesignIssues } from "../../src/kernel/design-graph.ts";

function issueCodesFor(design: unknown): DesignIssueCode[] {
  return findDesignIssues(design, registry).map((issue) => issue.code);
}

const validDesign = buildClientApiServerDesign();

describe("buildDesignGraph", () => {
  it("indexes nodes and resolves each out port's targets", () => {
    const graph = buildDesignGraph(validDesign, registry);
    expect(graph.nodes.map((node) => node.id)).toEqual(["client", "api"]);
    expect(graph.nodes[0]?.targetsByPort).toEqual([[1]]);
    expect(graph.nodes[1]?.targetsByPort).toEqual([[]]);
  });

  it("records which edge leads to each target", () => {
    const graph = buildDesignGraph(validDesign, registry);
    expect(graph.edgeIds).toEqual(["client-to-api"]);
    expect(graph.nodes[0]?.edgesByPort).toEqual([[0]]);
  });

  it("finds no issues in a design that can run", () => {
    expect(findDesignIssues(validDesign, registry)).toEqual([]);
  });

  it("applies config defaults", () => {
    const graph = buildDesignGraph(validDesign, registry);
    expect(graph.nodes[1]?.config).toMatchObject({ instances: 2, concurrency: 50 });
  });

  it("rejects a document without nodes and edges", () => {
    expect(issueCodesFor(null)).toEqual(["invalid-document"]);
    expect(issueCodesFor({ schemaVersion: 1 })).toEqual(["invalid-document"]);
  });

  it("rejects an unsupported schema version", () => {
    expect(issueCodesFor({ ...validDesign, schemaVersion: 2 })).toEqual([
      "unsupported-schema-version",
    ]);
  });

  it.each([
    { durationSeconds: 0, seed: 1 },
    { durationSeconds: -5, seed: 1 },
    { durationSeconds: 10, seed: -1 },
    { durationSeconds: 10, seed: 1.5 },
    { durationSeconds: "10", seed: 1 },
  ])("rejects run settings %j", (run) => {
    expect(issueCodesFor({ ...validDesign, run })).toEqual(["invalid-run-settings"]);
  });

  it("rejects duplicate node ids", () => {
    const design = { ...validDesign, nodes: [...validDesign.nodes, { id: "api", type: "api-server" }] };
    expect(issueCodesFor(design)).toEqual(["duplicate-node-id"]);
  });

  it("rejects unknown component types", () => {
    const design = { ...validDesign, nodes: [{ id: "client", type: "mainframe" }], edges: [] };
    expect(issueCodesFor(design)).toEqual(["unknown-component-type"]);
  });

  it("reports every invalid config field with its node", () => {
    const design = buildClientApiServerDesign({ apiServer: { instances: 0, queueLimit: -1 } });
    try {
      buildDesignGraph(design, registry);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DesignError);
      expect((error as DesignError).issues).toMatchObject([
        { code: "invalid-config", nodeId: "api", field: "instances" },
        { code: "invalid-config", nodeId: "api", field: "queueLimit" },
      ]);
    }
  });

  it("rejects edges to missing nodes and ports", () => {
    const edges = [
      { id: "e1", from: { node: "client", port: "out" }, to: { node: "ghost", port: "in" } },
      { id: "e2", from: { node: "client", port: "exit" }, to: { node: "api", port: "in" } },
    ];
    expect(issueCodesFor({ ...validDesign, edges })).toEqual(["unknown-node", "unknown-port"]);
  });

  it("rejects edges that run from an in port or into an out port", () => {
    const edges = [
      { id: "e1", from: { node: "api", port: "in" }, to: { node: "client", port: "out" } },
    ];
    expect(issueCodesFor({ ...validDesign, edges })).toEqual([
      "wrong-port-direction",
      "wrong-port-direction",
    ]);
  });
});
