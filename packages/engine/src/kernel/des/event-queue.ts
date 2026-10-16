import type { Micros } from "../../contract/time-units.ts";

const INITIAL_CAPACITY = 1024;
/** Upper bound on events pending at once. Handles pack a slot below this value. */
const MAX_PENDING_EVENTS = 2 ** 22;
const NO_SEQUENCE = -1;

/** Returned by `pop` when no event is pending. */
export const NO_EVENT = -1;

/**
 * The future event list: a binary min-heap ordered by (time, insertion order).
 *
 * Events live in parallel typed arrays indexed by slot and the heap holds slot numbers,
 * so scheduling and popping allocate nothing. Cancelled events stay in the heap and are
 * dropped when they reach the top.
 */
export class EventQueue {
  timeMicros: Float64Array;
  kind: Uint8Array;
  nodeIndex: Int32Array;
  callSlot: Int32Array;
  timerKind: Int32Array;
  argument: Float64Array;

  private sequence: Float64Array;
  private isCancelled: Uint8Array;
  private heap: Int32Array;
  private freeSlots: Int32Array;
  private capacity: number;
  private heapSize = 0;
  private freeCount: number;
  private nextSequence = 0;

  constructor(initialCapacity = INITIAL_CAPACITY) {
    this.capacity = initialCapacity;
    this.timeMicros = new Float64Array(initialCapacity);
    this.kind = new Uint8Array(initialCapacity);
    this.nodeIndex = new Int32Array(initialCapacity);
    this.callSlot = new Int32Array(initialCapacity);
    this.timerKind = new Int32Array(initialCapacity);
    this.argument = new Float64Array(initialCapacity);
    this.sequence = new Float64Array(initialCapacity).fill(NO_SEQUENCE);
    this.isCancelled = new Uint8Array(initialCapacity);
    this.heap = new Int32Array(initialCapacity);
    this.freeSlots = new Int32Array(initialCapacity);
    this.freeCount = initialCapacity;
    for (let slot = 0; slot < initialCapacity; slot++) {
      this.freeSlots[slot] = initialCapacity - 1 - slot;
    }
  }

  /** Schedules an event and returns a handle that `cancel` accepts. */
  push(
    timeMicros: Micros,
    kind: number,
    nodeIndex: number,
    callSlot: number,
    timerKind: number,
    argument: number,
  ): number {
    if (this.freeCount === 0) {
      this.grow();
    }
    this.freeCount--;
    const slot = this.freeSlots[this.freeCount]!;
    const sequence = this.nextSequence++;
    this.timeMicros[slot] = timeMicros;
    this.kind[slot] = kind;
    this.nodeIndex[slot] = nodeIndex;
    this.callSlot[slot] = callSlot;
    this.timerKind[slot] = timerKind;
    this.argument[slot] = argument;
    this.sequence[slot] = sequence;
    this.isCancelled[slot] = 0;
    this.siftUp(this.heapSize++, slot);
    return sequence * MAX_PENDING_EVENTS + slot;
  }

  /** Cancels a pending event. A handle whose event already fired is ignored. */
  cancel(handle: number): void {
    const slot = handle % MAX_PENDING_EVENTS;
    const sequence = (handle - slot) / MAX_PENDING_EVENTS;
    if (this.sequence[slot] === sequence) {
      this.isCancelled[slot] = 1;
    }
  }

  /** Time of the next live event, or `Infinity` when none is pending. */
  peekTimeMicros(): Micros {
    this.dropCancelledHead();
    return this.heapSize === 0 ? Number.POSITIVE_INFINITY : this.timeMicros[this.heap[0]!]!;
  }

  /**
   * Removes the next live event and returns its slot, or `NO_EVENT`. Read the event's
   * fields from the public arrays, then hand the slot back with `release`.
   */
  pop(): number {
    this.dropCancelledHead();
    if (this.heapSize === 0) {
      return NO_EVENT;
    }
    const slot = this.heap[0]!;
    this.removeHead();
    return slot;
  }

  /** Makes a popped slot available for reuse. */
  release(slot: number): void {
    this.sequence[slot] = NO_SEQUENCE;
    this.freeSlots[this.freeCount++] = slot;
  }

  private dropCancelledHead(): void {
    while (this.heapSize > 0) {
      const slot = this.heap[0]!;
      if (this.isCancelled[slot] === 0) {
        return;
      }
      this.removeHead();
      this.release(slot);
    }
  }

  private removeHead(): void {
    this.heapSize--;
    if (this.heapSize > 0) {
      this.siftDown(0, this.heap[this.heapSize]!);
    }
  }

  private isBefore(slot: number, otherSlot: number): boolean {
    const time = this.timeMicros[slot]!;
    const otherTime = this.timeMicros[otherSlot]!;
    return time < otherTime || (time === otherTime && this.sequence[slot]! < this.sequence[otherSlot]!);
  }

  private siftUp(startIndex: number, slot: number): void {
    let index = startIndex;
    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      const parentSlot = this.heap[parentIndex]!;
      if (!this.isBefore(slot, parentSlot)) {
        break;
      }
      this.heap[index] = parentSlot;
      index = parentIndex;
    }
    this.heap[index] = slot;
  }

  private siftDown(startIndex: number, slot: number): void {
    let index = startIndex;
    const size = this.heapSize;
    for (;;) {
      let childIndex = 2 * index + 1;
      if (childIndex >= size) {
        break;
      }
      let childSlot = this.heap[childIndex]!;
      const rightIndex = childIndex + 1;
      if (rightIndex < size) {
        const rightSlot = this.heap[rightIndex]!;
        if (this.isBefore(rightSlot, childSlot)) {
          childIndex = rightIndex;
          childSlot = rightSlot;
        }
      }
      if (!this.isBefore(childSlot, slot)) {
        break;
      }
      this.heap[index] = childSlot;
      index = childIndex;
    }
    this.heap[index] = slot;
  }

  private grow(): void {
    const oldCapacity = this.capacity;
    const newCapacity = oldCapacity * 2;
    if (newCapacity > MAX_PENDING_EVENTS) {
      throw new RangeError(`More than ${MAX_PENDING_EVENTS} events are pending at once.`);
    }
    this.timeMicros = grown(this.timeMicros, newCapacity);
    this.argument = grown(this.argument, newCapacity);
    this.sequence = grown(this.sequence, newCapacity).fill(NO_SEQUENCE, oldCapacity);
    this.nodeIndex = grown(this.nodeIndex, newCapacity);
    this.callSlot = grown(this.callSlot, newCapacity);
    this.timerKind = grown(this.timerKind, newCapacity);
    this.heap = grown(this.heap, newCapacity);
    this.freeSlots = grown(this.freeSlots, newCapacity);
    this.kind = grown(this.kind, newCapacity);
    this.isCancelled = grown(this.isCancelled, newCapacity);
    for (let slot = newCapacity - 1; slot >= oldCapacity; slot--) {
      this.freeSlots[this.freeCount++] = slot;
    }
    this.capacity = newCapacity;
  }
}

/** A copy of `source` in a new array of the same type and the given capacity. */
function grown<Typed extends Float64Array | Int32Array | Uint8Array>(source: Typed, capacity: number): Typed {
  const copy = new (source.constructor as new (length: number) => Typed)(capacity);
  copy.set(source);
  return copy;
}
