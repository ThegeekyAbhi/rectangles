import { describe, expect, it } from "vitest";
import type { EventDispatcher, EventLoopLimits } from "../../../src/kernel/des/event-loop.ts";
import { EventLoop } from "../../../src/kernel/des/event-loop.ts";

const LIMITS: EventLoopLimits = { endMicros: 1_000, endReason: "completed", maxEvents: 100 };

/** Records what it is handed, and the clock at that moment. */
function recordingDispatcher(loop: EventLoop) {
  const seen: { kind: number; nodeIndex: number; nowMicros: number }[] = [];
  const dispatcher: EventDispatcher = {
    dispatch(kind, nodeIndex) {
      seen.push({ kind, nodeIndex, nowMicros: loop.nowMicros });
    },
  };
  return { seen, dispatcher };
}

describe("event loop", () => {
  it("hands events over in time order, then insertion order, with the clock at each event", () => {
    const loop = new EventLoop(LIMITS);
    loop.queue.push(300, 1, 0, -1, 0, 0);
    loop.queue.push(100, 2, 1, -1, 0, 0);
    loop.queue.push(100, 3, 2, -1, 0, 0);
    const { seen, dispatcher } = recordingDispatcher(loop);

    expect(loop.step(Number.POSITIVE_INFINITY, dispatcher)).toBe(true);
    expect(seen).toEqual([
      { kind: 2, nodeIndex: 1, nowMicros: 100 },
      { kind: 3, nodeIndex: 2, nowMicros: 100 },
      { kind: 1, nodeIndex: 0, nowMicros: 300 },
    ]);
    expect(loop.eventsProcessed).toBe(3);
  });

  it("ends at the end time without handling events at or after it", () => {
    const loop = new EventLoop(LIMITS);
    loop.queue.push(1_000, 0, 0, -1, 0, 0);
    const { seen, dispatcher } = recordingDispatcher(loop);

    loop.step(Number.POSITIVE_INFINITY, dispatcher);
    expect(seen).toEqual([]);
    expect(loop.nowMicros).toBe(1_000);
    expect(loop.stopReason).toBe("completed");
  });

  it("reports the end reason it was given", () => {
    const loop = new EventLoop({ ...LIMITS, endReason: "time-limit" });
    loop.step(Number.POSITIVE_INFINITY, recordingDispatcher(loop).dispatcher);
    expect(loop.stopReason).toBe("time-limit");
  });

  it("stops at the event limit", () => {
    const loop = new EventLoop({ ...LIMITS, maxEvents: 2 });
    for (let time = 1; time <= 5; time++) {
      loop.queue.push(time, 0, 0, -1, 0, 0);
    }
    const { seen, dispatcher } = recordingDispatcher(loop);

    expect(loop.step(Number.POSITIVE_INFINITY, dispatcher)).toBe(true);
    expect(seen).toHaveLength(2);
    expect(loop.stopReason).toBe("event-limit");
  });

  it("pauses at the slice end and resumes where it left off", () => {
    const loop = new EventLoop(LIMITS);
    loop.queue.push(100, 0, 0, -1, 0, 0);
    loop.queue.push(500, 0, 1, -1, 0, 0);
    const { seen, dispatcher } = recordingDispatcher(loop);

    expect(loop.step(200, dispatcher)).toBe(false);
    expect(seen.map((event) => event.nodeIndex)).toEqual([0]);
    expect(loop.nowMicros).toBe(200);
    expect(loop.stopReason).toBeNull();

    expect(loop.step(Number.POSITIVE_INFINITY, dispatcher)).toBe(true);
    expect(seen.map((event) => event.nodeIndex)).toEqual([0, 1]);
  });

  it("lets a handler schedule more events, including at the current instant", () => {
    const loop = new EventLoop(LIMITS);
    loop.queue.push(10, 0, 0, -1, 0, 0);
    const seen: number[] = [];
    loop.step(Number.POSITIVE_INFINITY, {
      dispatch(_kind, nodeIndex) {
        seen.push(nodeIndex);
        if (nodeIndex < 3) {
          loop.queue.push(loop.nowMicros, 0, nodeIndex + 1, -1, 0, 0);
        }
      },
    });
    expect(seen).toEqual([0, 1, 2, 3]);
    expect(loop.eventsProcessed).toBe(4);
  });
});
