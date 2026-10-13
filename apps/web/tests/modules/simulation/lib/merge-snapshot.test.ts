import { describe, expect, it } from "vitest";
import { mergeSnapshot, nextSnapshotWindow } from "@/modules/simulation/lib/merge-snapshot";
import { runToEnd, takeSnapshots } from "../../../support/run-fixtures";

describe("mergeSnapshot", () => {
  it("takes the first snapshot as it is", () => {
    const [first] = takeSnapshots([{ untilSeconds: 0.5, fromWindow: 0 }]);
    expect(mergeSnapshot(null, first!)).toBe(first);
  });

  it("rebuilds every window of the run from snapshots that each report only the newest", () => {
    // Taken as the worker takes them: each starts at the window still filling last time.
    const snapshots = takeSnapshots([
      { untilSeconds: 0.5, fromWindow: 0 },
      { untilSeconds: 1.7, fromWindow: 0 },
      { untilSeconds: 2.2, fromWindow: 1 },
      { untilSeconds: 4, fromWindow: 2 },
    ]);
    let merged = null;
    for (const snapshot of snapshots) {
      merged = mergeSnapshot(merged, snapshot);
    }
    const result = runToEnd();

    expect(merged?.fromWindow).toBe(0);
    expect(merged?.summary.windows).toEqual(result.summary.windows);
    expect(merged?.edges).toEqual(result.edges);
    expect(merged?.nodes.map((node) => node.metrics.map((metric) => metric.windows))).toEqual(
      result.nodes.map((node) => node.metrics.map((metric) => metric.windows)),
    );
  });
});

describe("nextSnapshotWindow", () => {
  it("asks again for the newest window, which was still filling", () => {
    const [early, later] = takeSnapshots([
      { untilSeconds: 0.5, fromWindow: 0 },
      { untilSeconds: 2.5, fromWindow: 0 },
    ]);
    expect(nextSnapshotWindow(early!)).toBe(0);
    expect(nextSnapshotWindow(later!)).toBe(2);
  });
});
