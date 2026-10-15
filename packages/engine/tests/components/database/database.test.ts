import { describe, expect, it } from "vitest";
import { runSimulation } from "../../../src/kernel/simulation.ts";
import type { RunResult } from "../../../src/metrics/run-result.ts";
import { registry } from "../../../src/registry.ts";
import type { ClientApiDatabaseDesignOptions } from "../../support/client-api-database-design.ts";
import { buildClientApiDatabaseDesign } from "../../support/client-api-database-design.ts";
import { expectRequestsConserved } from "../../support/expect-requests-conserved.ts";
import { findCounter, findGauge, findSample } from "../../support/find-metric.ts";
import { meanWaitSecondsMmc } from "../../support/queueing-formulas.ts";

const UNLIMITED_EVENTS = { maxEvents: Number.MAX_SAFE_INTEGER };
const TEST_TIMEOUT_MS = 30_000;

function run(options: ClientApiDatabaseDesignOptions): RunResult {
  const result = runSimulation(buildClientApiDatabaseDesign(options), { registry, limits: UNLIMITED_EVENTS });
  expectRequestsConserved(result);
  return result;
}

function databaseCalls(result: RunResult) {
  const calls = result.nodes.find((node) => node.id === "database")?.calls;
  if (calls === undefined) {
    throw new Error("The design has no database.");
  }
  return calls;
}

const READS_ONLY = { readRatio: 1 };
const WRITES_ONLY = { readRatio: 0 };

describe("database limited by its CPU", () => {
  // 4 cores ÷ 5 ms = 800 reads/s, offered 1,000/s with connections to spare.
  const result = run({
    client: { ...READS_ONLY, ratePerSecond: 1_000 },
    database: { maxConnections: 1_000, connectionQueueLimit: 100_000, cpuCores: 4, readTimeMs: 5, queryTimeDistribution: "constant" },
    durationSeconds: 20,
  });

  it("completes reads at cores ÷ read time, however many connections are open", () => {
    expect(findCounter(result, "database", "queries.reads").total / 20 / 800).toBeCloseTo(1, 1);
    expect(findGauge(result, "database", "cpu.utilisation").max).toBe(1);
  });

  it("parks the excess on connections waiting for a core", () => {
    expect(findGauge(result, "database", "cpu.queue-depth").max).toBeGreaterThan(100);
  });
});

describe("database queueing for cores", () => {
  it(
    "waits for a core as long as an M/M/c queue predicts",
    () => {
      // 4 cores, 5 ms reads, 600 reads/s: utilisation 0.75.
      const result = run({
        client: { ...READS_ONLY, ratePerSecond: 600 },
        database: { maxConnections: 1_000, cpuCores: 4, readTimeMs: 5 },
        durationSeconds: 300,
      });
      const expectedWaitMs = meanWaitSecondsMmc(600, 200, 4) * 1_000;
      const waitMs = findSample(result, "database", "query.latency").mean - 5;
      expect(waitMs / expectedWaitMs).toBeCloseTo(1, 1);
    },
    TEST_TIMEOUT_MS,
  );
});

describe("database with an exhausted connection pool", () => {
  // 5 connections ÷ 10 ms = 500 queries/s; 8 cores are never the limit.
  const result = run({
    client: { ...READS_ONLY, ratePerSecond: 1_000 },
    database: { maxConnections: 5, cpuCores: 8, readTimeMs: 10, queryTimeDistribution: "constant" },
    durationSeconds: 20,
  });

  it("uses every connection and fills the queue to its limit", () => {
    expect(findGauge(result, "database", "utilisation").max).toBe(1);
    expect(findGauge(result, "database", "queue.depth").max).toBe(200);
    expect(findGauge(result, "database", "cpu.utilisation").max).toBeLessThanOrEqual(5 / 8);
  });

  it("rejects what the pool cannot carry, and the API server fails those requests", () => {
    const rejected = findCounter(result, "database", "queries.rejected").total;
    expect(rejected / 20 / 500).toBeCloseTo(1, 1);
    expect(findCounter(result, "api", "requests.failed").total).toBe(rejected);
    expect(result.summary.failed).toBe(rejected);
  });
});

describe("database with one hot row", () => {
  // Every write goes to key 0, so they run one at a time: 1 ÷ 10 ms = 100 writes/s.
  const result = run({
    client: { ...WRITES_ONLY, keyCount: 1, ratePerSecond: 150 },
    database: { maxConnections: 100, cpuCores: 4, writeTimeMs: 10, queryTimeDistribution: "constant", connectionQueueLimit: 100_000 },
    durationSeconds: 20,
  });

  it("never runs two writes to the same row at once", () => {
    expect(findGauge(result, "database", "cpu.utilisation").max).toBeLessThanOrEqual(1 / 4);
  });

  it("serialises writes to one row, however many cores there are", () => {
    expect(findCounter(result, "database", "queries.writes").total / 20 / 100).toBeCloseTo(1, 1);
  });

  it("holds connections while writes wait for the lock, until the pool runs out", () => {
    expect(findGauge(result, "database", "locks.waiting").max).toBe(99);
    expect(findGauge(result, "database", "utilisation").max).toBe(1);
    expect(findSample(result, "database", "locks.wait").max).toBeGreaterThan(500);
  });
});

describe("database whose working set does not fit in memory", () => {
  const options = (rowsInMemory: number): ClientApiDatabaseDesignOptions => ({
    client: { ...READS_ONLY, keyCount: 10_000, keySkew: 0, ratePerSecond: 1_000 },
    database: { rowsInMemory, maxConnections: 1_000, cpuCores: 64, readTimeMs: 1, diskReadMs: 4 },
    durationSeconds: 100,
  });
  const small = run(options(2_000));
  const large = run(options(10_000));

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

describe("database timeouts", () => {
  it("rejects a query that waits too long for a connection, and never runs it afterwards", () => {
    const result = run({
      client: { ...READS_ONLY, ratePerSecond: 50 },
      database: { maxConnections: 1, cpuCores: 1, readTimeMs: 100, queryTimeDistribution: "constant", connectionWaitTimeoutMs: 50 },
      durationSeconds: 10,
    });
    const rejected = findCounter(result, "database", "queries.rejected").total;
    expect(rejected).toBeGreaterThan(0);
    expect(findCounter(result, "database", "queries.reads").total + rejected).toBe(databaseCalls(result).replied);
  });

  it("fails a write that waits too long for its row lock", () => {
    const result = run({
      client: { ...WRITES_ONLY, keyCount: 1, ratePerSecond: 50 },
      database: { maxConnections: 10, writeTimeMs: 100, queryTimeDistribution: "constant", lockWaitTimeoutMs: 50 },
      durationSeconds: 10,
    });
    const failed = findCounter(result, "database", "queries.failed").total;
    expect(failed).toBeGreaterThan(0);
    expect(findCounter(result, "database", "queries.writes").total + failed).toBe(databaseCalls(result).replied);
    expect(result.summary.failed).toBe(failed);
  });
});

describe("API server calling a database", () => {
  it("runs each request's queries one after another", () => {
    const result = run({
      client: { ratePerSecond: 100 },
      queriesPerRequest: 3,
      durationSeconds: 10,
    });
    const completed = findCounter(result, "api", "requests.completed").total;
    expect(databaseCalls(result).replied).toBeGreaterThanOrEqual(3 * completed);
    expect(databaseCalls(result).received).toBeLessThanOrEqual(3 * completed + 3 * 100);
  });

  it("holds its slot while the database works, so a slow database fills the API server", () => {
    // 2 connections ÷ 50 ms = 40 queries/s, offered 100/s.
    const result = run({
      client: { ...READS_ONLY, ratePerSecond: 100 },
      apiServer: { instances: 1, concurrency: 20, serviceTimeMs: 1, queueLimit: 10 },
      database: { maxConnections: 2, readTimeMs: 50 },
      durationSeconds: 20,
    });
    expect(findGauge(result, "api", "utilisation").max).toBe(1);
    expect(findCounter(result, "api", "requests.rejected").total).toBeGreaterThan(0);
    expect(findSample(result, "api", "database.wait").mean).toBeGreaterThan(50);
  });
});
