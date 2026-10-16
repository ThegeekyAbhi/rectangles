import type { Micros } from "../../contract/time-units.ts";
import type { StopReason } from "../../metrics/run-snapshot.ts";
import { EventQueue } from "./event-queue.ts";

/**
 * Receives each event the loop takes off the queue. The loop only orders events in time;
 * what an event means belongs to the dispatcher.
 */
export interface EventDispatcher {
  dispatch(kind: number, nodeIndex: number, callSlot: number, timerKind: number, argument: number): void;
}

export interface EventLoopLimits {
  /** The run ends when the next event is at or past this time. */
  readonly endMicros: Micros;
  /** Reported when the run reaches `endMicros`. */
  readonly endReason: StopReason;
  readonly maxEvents: number;
}

/**
 * The discrete-event core: one clock that jumps from event to event, the future event
 * list, and the limits that end a run. It knows nothing about calls, nodes or ports.
 */
export class EventLoop {
  readonly queue = new EventQueue();
  nowMicros: Micros = 0;
  /** Events handled so far; the run stops once this reaches the event limit. */
  eventsProcessed = 0;
  /** `null` until the run has ended. */
  stopReason: StopReason | null = null;
  private readonly limits: EventLoopLimits;

  constructor(limits: EventLoopLimits) {
    this.limits = limits;
  }

  /**
   * Hands events to `dispatcher` in time order, up to and including `untilMicros`.
   * @returns `true` once the run has ended.
   */
  step(untilMicros: Micros, dispatcher: EventDispatcher): boolean {
    const queue = this.queue;
    const { endMicros, endReason, maxEvents } = this.limits;
    while (this.stopReason === null) {
      const nextMicros = queue.peekTimeMicros();
      if (nextMicros >= endMicros) {
        this.nowMicros = endMicros;
        this.stopReason = endReason;
        break;
      }
      if (nextMicros > untilMicros) {
        this.nowMicros = Math.max(this.nowMicros, untilMicros);
        return false;
      }
      if (this.eventsProcessed >= maxEvents) {
        this.stopReason = "event-limit";
        break;
      }

      // Never empty: the peek above found a live event before the end of the run.
      const slot = queue.pop();
      const kind = queue.kind[slot]!;
      const nodeIndex = queue.nodeIndex[slot]!;
      const callSlot = queue.callSlot[slot]!;
      const timerKind = queue.timerKind[slot]!;
      const argument = queue.argument[slot]!;
      queue.release(slot);

      this.nowMicros = nextMicros;
      this.eventsProcessed++;
      dispatcher.dispatch(kind, nodeIndex, callSlot, timerKind, argument);
    }
    return true;
  }
}
