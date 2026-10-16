import { describe, expect, it } from "vitest";
import type { ClientApiDatabaseDesignOptions } from "../../support/client-api-database-design.ts";
import { findCounter, findSample } from "../../support/find-metric.ts";
import { READS_ONLY, runClientApiDatabase } from "../../support/run-client-api-database.ts";

describe("database whose working set does not fit in memory", () => {
  const options = (rowsInMemory: number): ClientApiDatabaseDesignOptions => ({
    client: { ...READS_ONLY, keyCount: 10_000, keySkew: 0, ratePerSecond: 1_000 },
    database: { rowsInMemory, maxConnections: 1_000, cpuCores: 64, readTimeMs: 1, diskReadMs: 4 },
    durationSeconds: 100,
  });
  const small = runClientApiDatabase(options(2_000));
  const large = runClientApiDatabase(options(10_000));

  it("hits memory in proportion to the share of rows it holds", () => {
    const hits = findCounter(small, "database", "buffer-cache.hits").total;
    const misses = findCounter(small, "database", "buffer-cache.misses").total;
    expect(hits / (hits + misses)).toBeCloseTo(0.2, 1);
  });

  it("adds a disk read to every miss", () => {
    const latencyGapMs =
      findSample(small, "database", "query.latency").mean - findSample(large, "database", "query.latency").mean;
    // About 0.8 of reads miss in the small cache, against only the first read of each key in the large one.
    expect(latencyGapMs / (4 * (0.8 - 0.1))).toBeCloseTo(1, 0);
  });
});
