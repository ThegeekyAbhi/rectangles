import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { EventQueue, NO_EVENT } from "../../../src/kernel/des/event-queue.ts";

interface PoppedEvent {
  readonly timeMicros: number;
  readonly order: number;
}

function drain(queue: EventQueue): PoppedEvent[] {
  const popped: PoppedEvent[] = [];
  for (let slot = queue.pop(); slot !== NO_EVENT; slot = queue.pop()) {
    popped.push({ timeMicros: queue.timeMicros[slot] ?? -1, order: queue.argument[slot] ?? -1 });
    queue.release(slot);
  }
  return popped;
}

describe("EventQueue", () => {
  it("reports no event when empty", () => {
    const queue = new EventQueue();
    expect(queue.pop()).toBe(NO_EVENT);
    expect(queue.peekTimeMicros()).toBe(Number.POSITIVE_INFINITY);
  });

  it("returns every field of a pushed event", () => {
    const queue = new EventQueue();
    queue.push(500, 2, 7, 11, 3, 0.25);
    const slot = queue.pop();
    expect(queue.timeMicros[slot]).toBe(500);
    expect(queue.kind[slot]).toBe(2);
    expect(queue.nodeIndex[slot]).toBe(7);
    expect(queue.callSlot[slot]).toBe(11);
    expect(queue.timerKind[slot]).toBe(3);
    expect(queue.argument[slot]).toBe(0.25);
  });

  test.prop([fc.array(fc.integer({ min: 0, max: 50 }), { maxLength: 500 })])(
    "pops events in time order, then insertion order",
    (times) => {
      // A small initial capacity forces the arrays to grow mid-test.
      const queue = new EventQueue(4);
      times.forEach((timeMicros, order) => queue.push(timeMicros, 0, 0, -1, 0, order));

      const expected = times
        .map((timeMicros, order) => ({ timeMicros, order }))
        .sort((left, right) => left.timeMicros - right.timeMicros || left.order - right.order);
      expect(drain(queue)).toEqual(expected);
    },
  );

  test.prop([
    fc.array(fc.record({ timeMicros: fc.integer({ min: 0, max: 50 }), isCancelled: fc.boolean() }), {
      maxLength: 300,
    }),
  ])("never pops a cancelled event", (events) => {
    const queue = new EventQueue(4);
    const handles = events.map((event, order) => queue.push(event.timeMicros, 0, 0, -1, 0, order));
    events.forEach((event, order) => {
      if (event.isCancelled) {
        queue.cancel(handles[order] ?? -1);
      }
    });

    const survivors = events.flatMap((event, order) => (event.isCancelled ? [] : [order]));
    expect(drain(queue).map((event) => event.order).sort((left, right) => left - right)).toEqual(
      survivors,
    );
  });

  it("ignores a cancel for an event that already fired, even after its slot is reused", () => {
    const queue = new EventQueue(4);
    const firedHandle = queue.push(1, 0, 0, -1, 0, 0);
    queue.release(queue.pop());
    queue.push(2, 0, 0, -1, 0, 1);

    queue.cancel(firedHandle);

    expect(drain(queue)).toEqual([{ timeMicros: 2, order: 1 }]);
  });

  it("skips cancelled events when peeking", () => {
    const queue = new EventQueue();
    const handle = queue.push(1, 0, 0, -1, 0, 0);
    queue.push(9, 0, 0, -1, 0, 1);
    queue.cancel(handle);
    expect(queue.peekTimeMicros()).toBe(9);
  });
});
