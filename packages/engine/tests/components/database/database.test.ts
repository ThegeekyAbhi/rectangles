import { describe, expect, it } from "vitest";
import type { RunResult } from "../../../src/metrics/run-result.ts";
import { findCounter, findGauge, findSample } from "../../support/find-metric.ts";
import { READS_ONLY, runClientApiDatabase, WRITES_ONLY } from "../../support/run-client-api-database.ts";
import { slotServer } from "../../support/slot-server.ts";

function databaseCalls(result: RunResult) {
  const calls = result.nodes.find((node) => node.id === "database")?.calls;
  if (calls === undefined) {
    throw new Error("The design has no database.");
  }
  return calls;
}

describe("database limited by its CPU", () => {
  // 4 cores ÷ 5 ms = 800 reads/s, offered 1,000/s with connections to spare.
  const result = runClientApiDatabase({
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

describe("database with an exhausted connection pool", () => {
  // 5 connections ÷ 10 ms = 500 queries/s; 8 cores are never the limit.
  const result = runClientApiDatabase({
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
  const result = runClientApiDatabase({
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

describe("database timeouts", () => {
  it("rejects a query that waits too long for a connection, and never runs it afterwards", () => {
    const result = runClientApiDatabase({
      client: { ...READS_ONLY, ratePerSecond: 50 },
      database: { maxConnections: 1, cpuCores: 1, readTimeMs: 100, queryTimeDistribution: "constant", connectionWaitTimeoutMs: 50 },
      durationSeconds: 10,
    });
    const rejected = findCounter(result, "database", "queries.rejected").total;
    expect(rejected).toBeGreaterThan(0);
    expect(findCounter(result, "database", "queries.reads").total + rejected).toBe(databaseCalls(result).replied);
  });

  it("fails a write that waits too long for its row lock", () => {
    const result = runClientApiDatabase({
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
    const result = runClientApiDatabase({
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
    const result = runClientApiDatabase({
      client: { ...READS_ONLY, ratePerSecond: 100 },
      apiServer: slotServer({ workers: 20, holdMs: 1, queueLimit: 10 }),
      database: { maxConnections: 2, readTimeMs: 50 },
      durationSeconds: 20,
    });
    expect(findGauge(result, "api", "utilisation").max).toBe(1);
    expect(findCounter(result, "api", "requests.rejected").total).toBeGreaterThan(0);
    expect(findSample(result, "api", "database.wait").mean).toBeGreaterThan(50);
  });
});
