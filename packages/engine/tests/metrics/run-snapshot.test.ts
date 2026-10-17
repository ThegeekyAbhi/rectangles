import { describe, expect, it } from "vitest";
import { createSimulation, runSimulation } from "../../src/kernel/simulation.ts";
import type { RunResult } from "../../src/metrics/run-result.ts";
import type { RunSnapshot } from "../../src/metrics/run-snapshot.ts";
import { registry } from "../../src/registry.ts";
import { buildClientApiServerDesign } from "../support/client-api-server-design.ts";
import { slotServer } from "../support/slot-server.ts";

// Enough traffic to queue and reject, so every kind of metric has something in it.
const design = buildClientApiServerDesign({
  durationSeconds: 4,
  client: { ratePerSecond: 400 },
  apiServer: slotServer({ workers: 4, holdMs: 12, queueLimit: 10 }),
});

/** The windows of every series in a snapshot or result, keyed by where they came from. */
function windowsOf(source: RunSnapshot | RunResult): Map<string, readonly unknown[]> {
  const windows = new Map<string, readonly unknown[]>([["summary", source.summary.windows]]);
  for (const node of source.nodes) {
    for (const metric of node.metrics) {
      windows.set(`${node.id}/${metric.id}`, metric.windows);
    }
  }
  for (const edge of source.edges) {
    windows.set(`edge/${edge.id}`, edge.sentWindows);
  }
  return windows;
}

describe("snapshot", () => {
  it("reports totals mid-run without whole-run percentiles", () => {
    const simulation = createSimulation(design, { registry });
    simulation.step(1_500_000);
    const snapshot = simulation.snapshot();
    const result = simulation.result();

    expect(snapshot.stopReason).toBeNull();
    expect(snapshot.simulatedSeconds).toBe(1.5);
    expect(snapshot.fromWindow).toBe(0);
    expect(snapshot.summary).not.toHaveProperty("latencyMs");
    expect(snapshot.summary).toEqual({ ...result.summary, latencyMs: undefined });
    expect(snapshot.edges).toEqual(result.edges);
    expect(windowsOf(snapshot)).toEqual(windowsOf(result));
  });

  it("reports only the windows from the one asked for", () => {
    const simulation = createSimulation(design, { registry });
    simulation.step(3_200_000);
    const all = windowsOf(simulation.snapshot());
    const recent = simulation.snapshot(2);

    expect(recent.fromWindow).toBe(2);
    for (const [key, windows] of windowsOf(recent)) {
      expect(windows, key).toEqual(all.get(key)?.slice(2));
      expect(windows, key).toHaveLength(2);
    }
  });

  it("rebuilds the final result's windows from snapshots taken along the way", () => {
    const simulation = createSimulation(design, { registry });
    const collected = new Map<string, unknown[]>();
    let cursor = 0;
    let isFinished = false;
    for (let untilMicros = 0; !isFinished; untilMicros += 370_000) {
      isFinished = simulation.step(untilMicros);
      const snapshot = simulation.snapshot(cursor);
      for (const [key, windows] of windowsOf(snapshot)) {
        // The newest window is still filling, so each snapshot replaces it.
        const kept = collected.get(key)?.slice(0, snapshot.fromWindow) ?? [];
        collected.set(key, [...kept, ...windows]);
      }
      cursor = Math.max(0, snapshot.fromWindow + snapshot.summary.windows.length - 1);
    }

    expect(collected).toEqual(windowsOf(runSimulation(design, { registry })));
  });

  it("does not change the result of the run", () => {
    const simulation = createSimulation(design, { registry });
    for (let untilMicros = 0; !simulation.step(untilMicros); untilMicros += 250_000) {
      simulation.snapshot();
    }
    expect(simulation.result()).toEqual(runSimulation(design, { registry }));
  });

  it("clamps a starting window beyond the run so far", () => {
    const simulation = createSimulation(design, { registry });
    simulation.step(1_500_000);
    const snapshot = simulation.snapshot(99);

    expect(snapshot.fromWindow).toBe(2);
    expect(snapshot.summary.windows).toEqual([]);
  });
});
