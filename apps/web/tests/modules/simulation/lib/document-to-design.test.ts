import { findDesignIssues, registry } from "@rectangles/engine";
import type { ProjectDocument } from "@rectangles/schema";
import { describe, expect, it } from "vitest";
import { documentToDesign } from "@/modules/simulation/lib/document-to-design";

const document: ProjectDocument = {
  schemaVersion: 1,
  nodes: [
    { id: "client", type: "client", label: "Shoppers", position: { x: 0, y: 0 }, config: { ratePerSecond: 250 } },
    { id: "api", type: "api-server", label: "Checkout API", position: { x: 400, y: 0 }, config: {} },
  ],
  edges: [{ id: "e1", from: { node: "client", port: "out" }, to: { node: "api", port: "in" } }],
};

describe("documentToDesign", () => {
  it("keeps what the engine simulates and drops labels and positions", () => {
    expect(documentToDesign(document, 30)).toEqual({
      schemaVersion: 1,
      run: { durationSeconds: 30, seed: 1 },
      nodes: [
        { id: "client", type: "client", config: { ratePerSecond: 250 } },
        { id: "api", type: "api-server", config: {} },
      ],
      edges: document.edges,
    });
  });

  it("produces a design the engine accepts", () => {
    const design = documentToDesign(document, 30);
    expect(findDesignIssues(design, registry)).toEqual([]);
  });
});
