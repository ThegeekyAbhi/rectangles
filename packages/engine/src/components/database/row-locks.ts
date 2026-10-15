import type { Call } from "../../contract/request.ts";

/**
 * Exclusive row locks. A key is present while a write holds its lock; its array lists
 * the writes waiting for it, oldest first.
 */
export type RowLocks = Map<number, Call[]>;

/** Takes the lock if the row is free. Returns whether it was taken; if not, the call waits. */
export function lockOrWait(locks: RowLocks, key: number, call: Call): boolean {
  const waiting = locks.get(key);
  if (waiting === undefined) {
    locks.set(key, []);
    return true;
  }
  waiting.push(call);
  return false;
}

/**
 * Releases a row and hands its lock to the oldest waiting write, which is returned.
 * Returns `null`, leaving the row free, when nothing is waiting.
 */
export function unlock(locks: RowLocks, key: number): Call | null {
  const next = locks.get(key)?.shift();
  if (next === undefined) {
    locks.delete(key);
    return null;
  }
  return next;
}

/** Removes a write that gave up waiting. The oldest waiter is the usual one, so this is quick. */
export function stopWaiting(locks: RowLocks, key: number, call: Call): void {
  const waiting = locks.get(key);
  const index = waiting?.indexOf(call) ?? -1;
  if (waiting !== undefined && index !== -1) {
    waiting.splice(index, 1);
  }
}
