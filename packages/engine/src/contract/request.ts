import type { Micros } from "./time-units.ts";

/**
 * How a call ended, as seen by the caller.
 *
 * - `ok`: the work was done.
 * - `rejected`: refused before any work started (for example a full queue).
 * - `failed`: accepted, then lost (for example a crash).
 * - `timed-out`: the caller stopped waiting.
 */
export type Outcome = "ok" | "rejected" | "failed" | "timed-out";

/** One attempt by an originator to get something done. Shared by every call made for it. */
export interface Request {
  readonly id: number;
  /** 0 for the first attempt, 1 for the first retry, and so on. */
  readonly attempt: number;
  readonly createdAtMicros: Micros;
}

/**
 * One hop of a request: a caller waiting on a callee.
 *
 * A call is valid from `send` until the caller's `onReply` returns. The engine reuses the
 * object afterwards, so a component must not keep a reference past that point.
 *
 * The scratch fields are free per-call storage, so components need no lookup tables.
 * The caller owns the `callerScratch` pair and the callee owns the `calleeScratch` pair.
 */
export interface Call {
  readonly request: Request;
  readonly sentAtMicros: Micros;
  /** The incoming call this one was made on behalf of, if any. */
  readonly parent: Call | null;
  callerScratchA: number;
  callerScratchB: number;
  calleeScratchA: number;
  calleeScratchB: number;
}
