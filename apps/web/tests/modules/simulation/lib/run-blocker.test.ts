import type { SimulationDesign } from "@rectangles/engine";
import { describe, expect, it } from "vitest";
import { findRunBlocker } from "@/modules/simulation/lib/run-blocker";
import { overloadedDesign } from "../../../support/run-fixtures";

const [client, api] = overloadedDesign.nodes;

function design(change: Partial<SimulationDesign>): SimulationDesign {
  return { ...overloadedDesign, ...change };
}

describe("findRunBlocker", () => {
  it("lets a connected client and server run", () => {
    expect(findRunBlocker(overloadedDesign)).toBeNull();
  });

  it("asks for a component on an empty board", () => {
    expect(findRunBlocker(design({ nodes: [], edges: [] }))).toMatch(/Add a component/);
  });

  it("asks for a client when nothing sends traffic", () => {
    expect(findRunBlocker(design({ nodes: [api!], edges: [] }))).toMatch(/Add a client/);
  });

  it("asks for a connection when no client is connected", () => {
    expect(findRunBlocker(design({ edges: [] }))).toMatch(/Connect a client/);
  });

  it("reports what the engine finds wrong, and how many more problems there are", () => {
    const broken = { ...api!, config: { workers: 0, queueLimit: -1 } };
    expect(findRunBlocker(design({ nodes: [client!, broken] }), () => "Checkout API")).toBe(
      "“Checkout API”, Workers: Must be between 1 and 1000000. (and 1 more)",
    );
  });

  it("explains a setting left over from an older version, and how to clear it", () => {
    const stale = { ...api!, config: { ...api!.config, instances: 2 } };
    expect(findRunBlocker(design({ nodes: [client!, stale] }), () => "API server 2")).toMatch(
      /^“API server 2” has a setting this version no longer uses \(instances\)\. Reload the page/,
    );
  });
});
