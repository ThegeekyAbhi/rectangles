import { describe, expect, it } from "vitest";
import type { SimulationDesign } from "../../src/kernel/design-graph.ts";
import { createEventBudgetProjector, estimateEventBudget } from "../../src/kernel/event-budget.ts";
import { runSimulation } from "../../src/kernel/simulation.ts";
import { registry } from "../../src/registry.ts";
import { buildClientApiServerDesign } from "../support/client-api-server-design.ts";

/** Client → load balancer → two API servers, with retries at both ends. */
function buildLoadBalancedDesign(ratePerSecond: number, durationSeconds: number): SimulationDesign {
  return {
    schemaVersion: 1,
    run: { durationSeconds, seed: 1 },
    nodes: [
      { id: "client", type: "client", config: { ratePerSecond, retries: 1 } },
      { id: "lb", type: "load-balancer" },
      { id: "api-0", type: "api-server" },
      { id: "api-1", type: "api-server", config: { serviceTimeMs: 60 } },
    ],
    edges: [
      { id: "c", from: { node: "client", port: "out" }, to: { node: "lb", port: "in" } },
      { id: "a0", from: { node: "lb", port: "out" }, to: { node: "api-0", port: "in" } },
      { id: "a1", from: { node: "lb", port: "out" }, to: { node: "api-1", port: "in" } },
    ],
  };
}

/** Where the real run stops; it must actually hit the event limit. */
function actualStopSeconds(design: SimulationDesign): number {
  const result = runSimulation(design, { registry });
  expect(result.stopReason).toBe("event-limit");
  return result.simulatedSeconds;
}

describe("estimateEventBudget", () => {
  it("measures a design small enough to run inside the probe", () => {
    const design = buildClientApiServerDesign({ client: { ratePerSecond: 100 }, durationSeconds: 10 });
    const estimate = estimateEventBudget(design, { registry });
    expect(estimate).toMatchObject({ isExact: true, expectedStopSeconds: null });
    expect(estimate.expectedEvents).toBe(runSimulation(design, { registry }).eventsProcessed);
  });

  it("says a design that fits will finish", () => {
    const design = buildClientApiServerDesign({ client: { ratePerSecond: 1000 }, durationSeconds: 60 });
    const estimate = estimateEventBudget(design, { registry });
    expect(estimate.isExact).toBe(false);
    expect(estimate.expectedStopSeconds).toBeNull();
    expect(estimate.expectedEvents / runSimulation(design, { registry }).eventsProcessed).toBeCloseTo(1, 1);
  });

  it.each([
    ["steady traffic", buildClientApiServerDesign({ client: { ratePerSecond: 4000 }, durationSeconds: 300 })],
    [
      "a ramp",
      buildClientApiServerDesign({
        client: { pattern: "ramp", ratePerSecond: 500, targetRatePerSecond: 4000, changeAtSeconds: 5, changeDurationSeconds: 120 },
        durationSeconds: 300,
      }),
    ],
    ["a load balancer with retries", buildLoadBalancedDesign(3000, 300)],
  ])("predicts where a run with %s stops, within 15%", (_name, design) => {
    const predicted = estimateEventBudget(design, { registry }).expectedStopSeconds;
    expect(predicted).not.toBeNull();
    expect(Math.abs((predicted ?? 0) / actualStopSeconds(design) - 1)).toBeLessThan(0.15);
  });

  it("respects a smaller event limit", () => {
    const design = buildClientApiServerDesign({ client: { ratePerSecond: 1000 }, durationSeconds: 60 });
    const estimate = estimateEventBudget(design, { registry, maxEvents: 200_000 });
    expect(estimate.maxEvents).toBe(200_000);
    expect(estimate.expectedStopSeconds).toBeGreaterThan(0);
    expect(estimate.expectedStopSeconds).toBeLessThan(60);
  });
});

describe("createEventBudgetProjector", () => {
  it("projects a run's stop from its progress so far", () => {
    const design = buildClientApiServerDesign({ client: { ratePerSecond: 4000 }, durationSeconds: 300 });
    const projector = createEventBudgetProjector(design, { registry });
    // 16,000 events per simulated second, steady: two million go by 125 s.
    const latest = { simulatedSeconds: 10, eventsProcessed: 160_000 };
    expect(projector.projectStopSeconds(null, latest)).toBeCloseTo(125, 3);
    expect(projector.projectTotalEvents(null, latest)).toBeCloseTo(4_800_000, 0);
    // Steady traffic gives two readings in proportion, so the earlier one changes nothing.
    expect(projector.projectStopSeconds({ simulatedSeconds: 5, eventsProcessed: 80_000 }, latest)).toBeCloseTo(125, 3);
  });

  it("separates a steady cost from a per-request cost on a ramp", () => {
    // From 0 to 1,000 requests/s over 100 s: requests by t are 5·t².
    const design = buildClientApiServerDesign({
      client: { pattern: "ramp", ratePerSecond: 0, targetRatePerSecond: 1000, changeAtSeconds: 0, changeDurationSeconds: 100 },
      durationSeconds: 100,
    });
    const projector = createEventBudgetProjector(design, { registry });
    // Readings made from 4,000 events/s steady plus 4 per request.
    const at = (seconds: number) => ({ simulatedSeconds: seconds, eventsProcessed: 4_000 * seconds + 4 * 5 * seconds ** 2 });
    expect(projector.projectTotalEvents(at(10), at(20))).toBeCloseTo(4_000 * 100 + 4 * 5 * 100 ** 2, 0);
  });

  it("projects nothing for a run that will finish", () => {
    const design = buildClientApiServerDesign({ client: { ratePerSecond: 100 }, durationSeconds: 60 });
    const latest = { simulatedSeconds: 10, eventsProcessed: 4_000 };
    expect(createEventBudgetProjector(design, { registry }).projectStopSeconds(null, latest)).toBeNull();
  });

  it("falls back to a steady rate when no source plans its traffic", () => {
    const design = { ...buildClientApiServerDesign({ durationSeconds: 300 }), edges: [] };
    const latest = { simulatedSeconds: 10, eventsProcessed: 100_000 };
    expect(createEventBudgetProjector(design, { registry }).projectStopSeconds(null, latest)).toBeCloseTo(200, 3);
  });
});
