import { describe, expect, it } from "vitest";
import { defineComponent } from "../../src/contract/component-definition.ts";
import { createRegistry } from "../../src/registry.ts";
import { findCounter } from "../support/find-metric.ts";
import { stubSinkComponent } from "../support/stub-sink.ts";
import { stubSourceComponent } from "../support/stub-source.ts";
import type { SimulationDesign } from "../../src/kernel/design-graph.ts";
import { createSimulation, runSimulation } from "../../src/kernel/simulation.ts";

const registry = createRegistry([stubSourceComponent, stubSinkComponent]);

function buildDesign(durationSeconds: number, sinkDelayMs = 0): SimulationDesign {
  return {
    schemaVersion: 1,
    run: { durationSeconds, seed: 1 },
    nodes: [
      { id: "source", type: "stub-source", config: { intervalMs: 10 } },
      { id: "sink", type: "stub-sink", config: { delayMs: sinkDelayMs } },
    ],
    edges: [{ id: "e1", from: { node: "source", port: "out" }, to: { node: "sink", port: "in" } }],
  };
}

describe("runSimulation", () => {
  it("delivers each call to its target and each reply to its caller", () => {
    const result = runSimulation(buildDesign(1), { registry });

    expect(result.stopReason).toBe("completed");
    expect(result.simulatedSeconds).toBe(1);
    // One call every 10 ms from t = 0, for one second.
    expect(findCounter(result, "source", "calls.sent").total).toBe(100);
    expect(findCounter(result, "sink", "calls.received").total).toBe(100);
    expect(findCounter(result, "source", "calls.answered").total).toBe(100);
    expect(result.nodes[1]?.calls).toEqual({ received: 100, replied: 100, inFlight: 0 });
  });

  it("leaves calls that are unanswered at the end in flight", () => {
    // Every answer takes 25 ms, so the calls sent at 980 and 990 ms are still open.
    const result = runSimulation(buildDesign(1, 25), { registry });
    expect(result.nodes[1]?.calls).toEqual({ received: 100, replied: 98, inFlight: 2 });
  });

  it("counts the calls that travel along each edge, per window and in total", () => {
    const result = runSimulation(buildDesign(2, 25), { registry });
    expect(result.edges).toEqual([
      { id: "e1", calls: { sent: 200, replied: 198, inFlight: 2 }, sentWindows: [100, 100] },
    ]);
  });

  it("counts each edge separately when one port has several targets", () => {
    const design = buildDesign(1);
    const result = runSimulation(
      {
        ...design,
        nodes: [...design.nodes, { id: "unused", type: "stub-sink" }],
        edges: [
          ...design.edges,
          { id: "e2", from: { node: "source", port: "out" }, to: { node: "unused", port: "in" } },
        ],
      },
      { registry },
    );
    // The stub source only ever sends to its first target.
    expect(result.edges.map((edge) => [edge.id, edge.calls.sent])).toEqual([
      ["e1", 100],
      ["e2", 0],
    ]);
  });

  it("does not process events at or after the end of the run", () => {
    const result = runSimulation(buildDesign(0.05), { registry });
    // Calls at 0, 10, 20, 30 and 40 ms; the one at 50 ms falls outside the run.
    expect(findCounter(result, "source", "calls.sent").total).toBe(5);
  });

  it("stops at the event limit and keeps the results so far", () => {
    const result = runSimulation(buildDesign(10), { registry, limits: { maxEvents: 400 } });

    expect(result.stopReason).toBe("event-limit");
    expect(result.eventsProcessed).toBe(400);
    expect(result.simulatedSeconds).toBeLessThan(10);
    expect(findCounter(result, "source", "calls.sent").total).toBe(100);
    expect(findCounter(result, "source", "calls.sent").windows).toHaveLength(1);
  });

  it("stops at the time limit when the design asks for a longer run", () => {
    const result = runSimulation(buildDesign(30), { registry, limits: { maxSimulatedSeconds: 2 } });

    expect(result.stopReason).toBe("time-limit");
    expect(result.simulatedSeconds).toBe(2);
    expect(findCounter(result, "source", "calls.sent").total).toBe(200);
  });

  it("gives identical results whether stepped or run in one go", () => {
    const simulation = createSimulation(buildDesign(2, 3), { registry });
    let isFinished = false;
    for (let untilMicros = 0; !isFinished; untilMicros += 137_000) {
      isFinished = simulation.step(untilMicros);
    }

    expect(simulation.result()).toEqual(runSimulation(buildDesign(2, 3), { registry }));
  });

  it("reports progress while a run is in flight", () => {
    const simulation = createSimulation(buildDesign(2), { registry });
    expect(simulation.step(500_000)).toBe(false);

    const partial = simulation.result();
    expect(partial.stopReason).toBeNull();
    expect(partial.simulatedSeconds).toBe(0.5);
    expect(findCounter(partial, "source", "calls.sent").total).toBe(51);
  });

  it("does nothing more once the run has ended", () => {
    const simulation = createSimulation(buildDesign(1), { registry });
    expect(simulation.step(Number.POSITIVE_INFINITY)).toBe(true);
    const finished = simulation.result();
    expect(simulation.step(Number.POSITIVE_INFINITY)).toBe(true);
    expect(simulation.result()).toEqual(finished);
  });
});

describe("component mistakes", () => {
  const sinkDefinition = stubSinkComponent.definition;

  function runWithSink(sink: ReturnType<typeof defineComponent>): void {
    runSimulation(buildDesign(1), { registry: createRegistry([stubSourceComponent, sink]) });
  }

  it("throws when a component answers the same call twice", () => {
    const doubleReplySink = defineComponent({
      definition: sinkDefinition,
      behaviour: {
        init: () => null,
        onArrive(context, call) {
          context.reply(call, "ok");
          context.reply(call, "ok");
        },
      },
    });
    expect(() => {
      runWithSink(doubleReplySink);
    }).toThrow(/same call twice/);
  });

  it("throws when a component asks for a metric it did not declare", () => {
    const undeclaredMetricSink = defineComponent({
      definition: sinkDefinition,
      behaviour: { init: (setup) => setup.metric("calls.dropped") },
    });
    expect(() => {
      runWithSink(undeclaredMetricSink);
    }).toThrow(/did not declare metric "calls.dropped"/);
  });

  it("throws when a component with an in port has no onArrive handler", () => {
    const deafSink = defineComponent({
      definition: sinkDefinition,
      behaviour: { init: () => null },
    });
    expect(() => {
      runWithSink(deafSink);
    }).toThrow(/no onArrive handler/);
  });

  it("throws when a component schedules a timer in the past", () => {
    const backwardsSink = defineComponent({
      definition: sinkDefinition,
      behaviour: {
        init: () => null,
        onArrive(context) {
          context.schedule(-1, 0);
        },
      },
    });
    expect(() => {
      runWithSink(backwardsSink);
    }).toThrow(/zero or more/);
  });
});

describe("connection settings", () => {
  const weightFields = {
    weight: { kind: "integer", label: "Weight", description: "Share.", default: 1, min: 1, max: 10 },
  } as const;

  function routerComponent(askWith: typeof weightFields) {
    return defineComponent({
      definition: {
        type: "router",
        label: "Router",
        description: "Reads its connections' settings.",
        category: "traffic",
        configFields: {},
        summarise: () => "router",
        ports: [
          { id: "out", direction: "out", protocol: "sync-request", description: "Targets.", connectionFields: weightFields },
        ],
        metrics: [{ id: "weight.total", kind: "gauge", unit: "weight", definition: "Sum of weights." }],
        notModeled: [],
      },
      behaviour: {
        init(setup) {
          const weights = setup.connections(setup.port("out"), askWith).map((connection) => connection.weight);
          return { total: setup.metric("weight.total"), sum: weights.reduce((sum, weight) => sum + weight, 0) };
        },
        onStart(context) {
          context.setGauge(context.state.total, context.state.sum);
        },
      },
    });
  }

  function designWithWeights(weights: readonly (number | undefined)[]): SimulationDesign {
    return {
      schemaVersion: 1,
      run: { durationSeconds: 1, seed: 1 },
      nodes: [{ id: "router", type: "router" }, ...weights.map((_weight, index) => ({ id: `sink-${index}`, type: "stub-sink" }))],
      edges: weights.map((weight, index) => ({
        id: `e${index}`,
        from: { node: "router", port: "out" },
        to: { node: `sink-${index}`, port: "in" },
        config: weight === undefined ? {} : { weight },
      })),
    };
  }

  it("hands a component each connection's validated settings, in target order", () => {
    const routerRegistry = createRegistry([routerComponent(weightFields), stubSinkComponent]);
    const result = runSimulation(designWithWeights([3, undefined, 5]), { registry: routerRegistry });
    const total = result.nodes[0]?.metrics.find((metric) => metric.id === "weight.total");
    expect(total).toMatchObject({ kind: "gauge", max: 9 });
  });

  it("refuses fields the port does not declare", () => {
    const lookalike = { weight: { ...weightFields.weight } } as const;
    const routerRegistry = createRegistry([routerComponent(lookalike), stubSinkComponent]);
    expect(() => runSimulation(designWithWeights([1]), { registry: routerRegistry })).toThrow(/does not declare/);
  });
});
