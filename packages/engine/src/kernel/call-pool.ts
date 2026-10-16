import type { Call, Outcome, Request } from "../contract/request.ts";
import type { Micros } from "../contract/time-units.ts";

/** Stored in an event when it carries no call. */
export const NO_CALL = -1;

/** A pooled call. The fields beyond `Call` belong to the kernel. */
export class CallRecord implements Call {
  readonly slot: number;
  request: Request = { id: -1, attempt: 0, createdAtMicros: 0, operation: "read", key: 0 };
  sentAtMicros: Micros = 0;
  parent: Call | null = null;
  callerScratchA = 0;
  callerScratchB = 0;
  calleeScratchA = 0;
  calleeScratchB = 0;
  callerIndex = -1;
  calleeIndex = -1;
  edgeIndex = -1;
  outcome: Outcome = "ok";
  isLive = false;
  isReplied = false;

  constructor(slot: number) {
    this.slot = slot;
  }
}

/**
 * Reuses call records, so a run allocates one per call in flight at its peak rather than
 * one per call. An event refers to a call by its slot number.
 */
export class CallPool {
  private readonly records: CallRecord[] = [];
  private readonly free: CallRecord[] = [];

  /** A record ready to be filled in for a new call. */
  acquire(): CallRecord {
    return this.free.pop() ?? this.create();
  }

  /** Returns a record to the pool once its caller has handled the reply. */
  release(record: CallRecord): void {
    record.isLive = false;
    record.parent = null;
    this.free.push(record);
  }

  /** The record in `slot`, or `null` for `NO_CALL`. */
  callAt(slot: number): CallRecord | null {
    return slot === NO_CALL ? null : (this.records[slot] ?? null);
  }

  private create(): CallRecord {
    const record = new CallRecord(this.records.length);
    this.records.push(record);
    return record;
  }
}
