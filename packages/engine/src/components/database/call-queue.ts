import type { Call } from "../../contract/request.ts";

/** A first-in, first-out queue of calls. Entries before `head` have already left. */
export interface CallQueue {
  items: Call[];
  head: number;
}

export function createCallQueue(): CallQueue {
  return { items: [], head: 0 };
}

export function queueLength(queue: CallQueue): number {
  return queue.items.length - queue.head;
}

export function enqueue(queue: CallQueue, call: Call): void {
  queue.items.push(call);
}

/** Takes the oldest call, or `null` when the queue is empty. */
export function dequeue(queue: CallQueue): Call | null {
  const call = queue.items[queue.head];
  if (call === undefined) {
    return null;
  }
  queue.head++;
  compact(queue);
  return call;
}

/**
 * Removes a call that gave up waiting. Every call waits with the same timeout, so the one
 * giving up is almost always the oldest and the search ends at once.
 */
export function removeFromQueue(queue: CallQueue, call: Call): void {
  const index = queue.items.indexOf(call, queue.head);
  if (index === queue.head) {
    queue.head++;
    compact(queue);
  } else if (index !== -1) {
    queue.items.splice(index, 1);
  }
}

/**
 * Drops the served prefix once it is at least half the array, so memory stays
 * proportional to the calls actually waiting.
 */
function compact(queue: CallQueue): void {
  if (queue.head * 2 >= queue.items.length) {
    queue.items = queue.items.slice(queue.head);
    queue.head = 0;
  }
}
