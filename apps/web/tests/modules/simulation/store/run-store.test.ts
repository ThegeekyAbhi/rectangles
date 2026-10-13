import { describe, expect, it } from "vitest";
import { createRunStore, DEFAULT_RUN_DURATION } from "@/modules/simulation/store/run-store";
import { runToEnd, takeSnapshots } from "../../../support/run-fixtures";

const board = { nodes: [], edges: [] };

describe("run store", () => {
  it("starts idle with the default duration", () => {
    expect(createRunStore().getState()).toMatchObject({
      status: "idle",
      durationSeconds: DEFAULT_RUN_DURATION,
      metrics: null,
    });
  });

  it("gathers snapshots into metrics that hold every window", () => {
    const store = createRunStore();
    const [first, second] = takeSnapshots([
      { untilSeconds: 1.5, fromWindow: 0 },
      { untilSeconds: 3.5, fromWindow: 1 },
    ]);
    store.getState().begin(board);
    store.getState().receive({ kind: "snapshot", snapshot: first! });
    store.getState().receive({ kind: "snapshot", snapshot: second! });

    const { status, metrics } = store.getState();
    expect(status).toBe("running");
    expect(metrics?.simulatedSeconds).toBe(3.5);
    expect(metrics?.summary.windows).toHaveLength(4);
  });

  it("replaces the live metrics with the finished result", () => {
    const store = createRunStore();
    const result = runToEnd();
    store.getState().begin(board);
    store.getState().receive({ kind: "finished", result });

    const state = store.getState();
    expect(state.status).toBe("finished");
    expect(state.result).toBe(result);
    expect(state.metrics).toMatchObject({ fromWindow: 0, summary: result.summary });
  });

  it("records why a run failed", () => {
    const store = createRunStore();
    store.getState().begin(board);
    store.getState().receive({ kind: "failed", message: "boom" });
    expect(store.getState()).toMatchObject({ status: "failed", failure: "boom" });
  });

  it("pauses and resumes only a run in progress", () => {
    const store = createRunStore();
    store.getState().setPaused(true);
    expect(store.getState().status).toBe("idle");

    store.getState().begin(board);
    store.getState().setPaused(true);
    expect(store.getState().status).toBe("paused");
    store.getState().setPaused(false);
    expect(store.getState().status).toBe("running");
  });

  it("clears earlier results when a new run begins", () => {
    const store = createRunStore();
    store.getState().begin(board);
    store.getState().receive({ kind: "finished", result: runToEnd() });
    store.getState().begin(board);
    expect(store.getState()).toMatchObject({ status: "running", metrics: null, result: null });
  });

  it("ignores reports that arrive after the results were cleared", () => {
    const store = createRunStore();
    store.getState().begin(board);
    store.getState().reset();
    store.getState().receive({ kind: "finished", result: runToEnd() });
    expect(store.getState()).toMatchObject({ status: "idle", metrics: null, ranElements: null });
  });

  it("keeps the chosen duration across a reset", () => {
    const store = createRunStore();
    store.getState().setDuration(300);
    store.getState().reset();
    expect(store.getState().durationSeconds).toBe(300);
  });
});
