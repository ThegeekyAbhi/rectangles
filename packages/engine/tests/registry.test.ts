import { describe, expect, it } from "vitest";
import type { RegisteredComponent } from "../src/contract/component-definition.ts";
import type { ConfigFields } from "../src/contract/config-field.ts";
import { validateConfig } from "../src/kernel/config-validation.ts";
import type { SimulationDesign } from "../src/kernel/design-graph.ts";
import { runSimulation } from "../src/kernel/simulation.ts";
import { createRegistry, registry } from "../src/registry.ts";
import { stubSinkComponent } from "./support/stub-sink.ts";
import { stubSourceComponent } from "./support/stub-source.ts";

/**
 * The conformance suite: checks every registered component must pass, so the kernel can
 * treat them all alike. A new component is covered as soon as it is registered.
 */
const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const METRIC_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*(\.[a-z][a-z0-9]*(-[a-z0-9]+)*)*$/;
const DURATION_SECONDS = 4;

const conformanceRegistry = createRegistry([
  ...registry.values(),
  stubSourceComponent,
  stubSinkComponent,
]);

/**
 * Wires the component into a runnable design: a stub source feeds each of its in ports
 * and a stub sink answers each of its out ports. Sources stop halfway through the run.
 */
function buildHarness(component: RegisteredComponent, seed: number): SimulationDesign {
  const { type, ports } = component.definition;
  const nodes: SimulationDesign["nodes"][number][] = [{ id: "subject", type }];
  const edges: SimulationDesign["edges"][number][] = [];
  for (const port of ports) {
    const stubId = `stub-for-${port.id}`;
    if (port.direction === "in") {
      nodes.push({
        id: stubId,
        type: "stub-source",
        config: { intervalMs: 5, stopAfterSeconds: DURATION_SECONDS / 2 },
      });
      edges.push({
        id: `edge-${port.id}`,
        from: { node: stubId, port: "out" },
        to: { node: "subject", port: port.id },
      });
    } else {
      nodes.push({ id: stubId, type: "stub-sink" });
      edges.push({
        id: `edge-${port.id}`,
        from: { node: "subject", port: port.id },
        to: { node: stubId, port: "in" },
      });
    }
  }
  return { schemaVersion: 1, run: { durationSeconds: DURATION_SECONDS, seed }, nodes, edges };
}

/** Every field has a label and a description, a default in range, and fits its relations. */
function expectFieldsExplained(fields: ConfigFields): void {
  for (const [name, field] of Object.entries(fields)) {
    expect(field.label, name).not.toBe("");
    expect(field.description, name).not.toBe("");
    if (field.kind === "choice") {
      expect(field.options, name).toContain(field.default);
      if (field.optionDescriptions !== undefined) {
        // One description per option: none missing, none for an option that is gone.
        expect(Object.keys(field.optionDescriptions).sort(), name).toEqual([...field.options].sort());
      }
    } else {
      expect(field.min, name).toBeLessThanOrEqual(field.default);
      expect(field.max, name).toBeGreaterThanOrEqual(field.default);
    }
    if (field.relevantWhen !== undefined) {
      expect(fields, name).toHaveProperty(field.relevantWhen.field);
    }
  }
}

describe("createRegistry", () => {
  it("rejects two components with the same type", () => {
    expect(() => createRegistry([stubSinkComponent, stubSinkComponent])).toThrow(
      /registered twice/,
    );
  });
});

describe.each([...registry.values()].map((component) => [component.definition.type, component] as const))(
  "component %s",
  (_type, component) => {
    const { definition } = component;
    const run = (seed: number) =>
      runSimulation(buildHarness(component, seed), { registry: conformanceRegistry });

    it("has a kebab-case type and describes itself", () => {
      expect(definition.type).toMatch(KEBAB_CASE);
      expect(definition.label).not.toBe("");
      expect(definition.description).not.toBe("");
    });

    it("summarises its default settings in one short line", () => {
      const validation = validateConfig(definition.configFields, {});
      const summary = validation.ok ? definition.summarise(validation.config) : "";
      expect(summary).not.toBe("");
      expect(summary.length).toBeLessThanOrEqual(28);
    });

    it("lists what it does not model", () => {
      expect(definition.notModeled.length).toBeGreaterThan(0);
    });

    it("has defaults that pass its own field specs", () => {
      expect(validateConfig(definition.configFields, {})).toMatchObject({ ok: true });
    });

    it("explains every config field and gives each number a sensible range", () => {
      expectFieldsExplained(definition.configFields);
    });

    it("declares connection settings only on out ports, each explained with valid defaults", () => {
      for (const port of definition.ports) {
        if (port.connectionFields === undefined) {
          continue;
        }
        expect(port.direction, port.id).toBe("out");
        expectFieldsExplained(port.connectionFields);
        expect(validateConfig(port.connectionFields, {}), port.id).toMatchObject({ ok: true });
      }
    });

    it("plans traffic, if it does, as a count that starts at zero and never falls", () => {
      const { expectedRequests } = definition;
      if (expectedRequests === undefined) {
        return;
      }
      const validation = validateConfig(definition.configFields, {});
      const config = validation.ok ? validation.config : {};
      const totals = [0, 1, 10, 60].map((seconds) => expectedRequests(config, seconds, 1));
      expect(totals[0]).toBe(0);
      expect(totals).toEqual([...totals].sort((left, right) => left - right));
      expect(expectedRequests(config, 10, 2)).toBe(2 * (totals[2] ?? 0));
    });

    it("declares uniquely named ports", () => {
      const portIds = definition.ports.map((port) => port.id);
      expect(new Set(portIds).size).toBe(portIds.length);
      for (const portId of portIds) {
        expect(portId).toMatch(KEBAB_CASE);
      }
    });

    it("declares uniquely named metrics, each with a unit and a definition", () => {
      const metricIds = definition.metrics.map((metric) => metric.id);
      expect(new Set(metricIds).size).toBe(metricIds.length);
      for (const metric of definition.metrics) {
        expect(metric.id).toMatch(METRIC_ID);
        expect(metric.unit, metric.id).not.toBe("");
        expect(metric.definition, metric.id).not.toBe("");
      }
    });

    it("reports every declared metric, in declaration order", () => {
      const subject = run(1).nodes[0];
      expect(subject?.metrics.map((metric) => ({ id: metric.id, kind: metric.kind }))).toEqual(
        definition.metrics.map((metric) => ({ id: metric.id, kind: metric.kind })),
      );
    });

    it("is deterministic under a seed", () => {
      expect(JSON.stringify(run(11))).toBe(JSON.stringify(run(11)));
    });

    it("answers every call it receives once its callers stop sending", () => {
      const subject = run(1).nodes[0];
      const hasInPort = definition.ports.some((port) => port.direction === "in");
      expect(subject?.calls.inFlight).toBe(0);
      if (hasInPort) {
        expect(subject?.calls.received).toBeGreaterThan(0);
      }
    });
  },
);
