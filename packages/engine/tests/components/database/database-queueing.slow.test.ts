import { describe, expect, it } from "vitest";
import { findSample } from "../../support/find-metric.ts";
import { meanWaitSecondsMmc } from "../../support/queueing-formulas.ts";
import { READS_ONLY, runClientApiDatabase } from "../../support/run-client-api-database.ts";

describe("database queueing for cores", () => {
  it("waits for a core as long as an M/M/c queue predicts", () => {
    // 4 cores, 5 ms reads, 600 reads/s: utilisation 0.75.
    const result = runClientApiDatabase({
      client: { ...READS_ONLY, ratePerSecond: 600 },
      database: { maxConnections: 1_000, cpuCores: 4, readTimeMs: 5 },
      durationSeconds: 300,
    });
    const expectedWaitMs = meanWaitSecondsMmc(600, 200, 4) * 1_000;
    const waitMs = findSample(result, "database", "query.latency").mean - 5;
    expect(waitMs / expectedWaitMs).toBeCloseTo(1, 1);
  });
});
