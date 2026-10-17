import { describe, expect, it } from "vitest";
import type { Call } from "../../../src/contract/request.ts";
import type { CpuPoolHost } from "../../../src/kernel/resources/cpu-pool.ts";
import { CpuPool } from "../../../src/kernel/resources/cpu-pool.ts";

const UTILISATION = 0;
const QUEUE_DEPTH = 1;

/** A host that records what the pool does instead of running a simulation. */
function recordingHost() {
  const gauges = new Map<number, number>();
  const started: { call: Call; delayMicros: number; timerKind: number }[] = [];
  const host: CpuPoolHost = {
    setGauge: (metric, value) => gauges.set(metric, value),
    nextExponential: (mean) => mean * 2,
    scheduleDone: (delayMicros, timerKind, call) => started.push({ call, delayMicros, timerKind }),
  };
  return { host, gauges, started };
}

const call = (id: number) => ({ id }) as unknown as Call;

describe("CpuPool", () => {
  it("starts work at once while a core is free, and keeps utilisation current", () => {
    const { host, gauges, started } = recordingHost();
    const pool = new CpuPool(0, 2, { utilisation: UTILISATION, queueDepth: QUEUE_DEPTH }, host);
    pool.use(call(1), 1_000, "constant", 7);
    expect(started).toEqual([{ call: call(1), delayMicros: 1_000, timerKind: 7 }]);
    expect(gauges.get(UTILISATION)).toBe(0.5);
  });

  it("queues work when every core is busy, then serves it first come, first served", () => {
    const { host, gauges, started } = recordingHost();
    const pool = new CpuPool(0, 1, { utilisation: UTILISATION, queueDepth: QUEUE_DEPTH }, host);
    pool.use(call(1), 1_000, "constant", 1);
    pool.use(call(2), 2_000, "constant", 2);
    pool.use(call(3), 3_000, "constant", 3);
    expect(pool.queued).toBe(2);
    expect(gauges.get(QUEUE_DEPTH)).toBe(2);

    pool.finish();
    expect(started.at(-1)).toEqual({ call: call(2), delayMicros: 2_000, timerKind: 2 });
    expect(gauges.get(QUEUE_DEPTH)).toBe(1);
    pool.finish();
    pool.finish();
    expect(started.map((work) => work.timerKind)).toEqual([1, 2, 3]);
    expect(pool.busy).toBe(0);
    expect(gauges.get(UTILISATION)).toBe(0);
  });

  it("draws exponential work lengths when the work starts, not when it queues", () => {
    const { host, started } = recordingHost();
    const pool = new CpuPool(0, 1, { utilisation: UTILISATION, queueDepth: QUEUE_DEPTH }, host);
    pool.use(call(1), 1_000, "exponential", 1);
    expect(started[0]?.delayMicros).toBe(2_000);
  });

  it("refuses a pool without a whole core", () => {
    const { host } = recordingHost();
    expect(() => new CpuPool(0, 0, { utilisation: UTILISATION, queueDepth: QUEUE_DEPTH }, host)).toThrow(RangeError);
    expect(() => new CpuPool(0, 1.5, { utilisation: UTILISATION, queueDepth: QUEUE_DEPTH }, host)).toThrow(RangeError);
  });
});
