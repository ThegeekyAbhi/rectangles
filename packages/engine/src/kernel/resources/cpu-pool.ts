import type { Call } from "../../contract/request.ts";
import type { CpuMetrics, WorkDistribution } from "../../contract/resources.ts";
import type { Micros } from "../../contract/time-units.ts";

/** What a pool needs from the node it belongs to. */
export interface CpuPoolHost {
  setGauge(metric: number, value: number): void;
  nextExponential(mean: number): number;
  /** Schedules the end of a piece of work on this pool, `delayMicros` from now. */
  scheduleDone(delayMicros: Micros, timerKind: number, call: Call, poolIndex: number): void;
}

/** Work waiting for a core. Only allocated when every core is busy. */
interface WaitingWork {
  readonly call: Call;
  readonly meanMicros: Micros;
  readonly distribution: WorkDistribution;
  readonly timerKind: number;
}

/**
 * A node's CPU cores, shared first come, first served. Work holds one core for its whole
 * length; work that finds every core busy waits in order. The pool keeps its owner's
 * utilisation and queue-depth gauges current.
 */
export class CpuPool {
  readonly index: number;
  readonly cores: number;
  private readonly metrics: CpuMetrics;
  private readonly host: CpuPoolHost;
  private busyCores = 0;
  private waiting: WaitingWork[] = [];
  private waitingHead = 0;

  constructor(index: number, cores: number, metrics: CpuMetrics, host: CpuPoolHost) {
    if (!Number.isInteger(cores) || cores < 1) {
      throw new RangeError(`A CPU pool needs a whole number of cores, at least 1, got ${cores}.`);
    }
    this.index = index;
    this.cores = cores;
    this.metrics = metrics;
    this.host = host;
  }

  get busy(): number {
    return this.busyCores;
  }

  get queued(): number {
    return this.waiting.length - this.waitingHead;
  }

  use(call: Call, meanMicros: Micros, distribution: WorkDistribution, timerKind: number): void {
    if (this.busyCores < this.cores) {
      this.start(call, meanMicros, distribution, timerKind);
      return;
    }
    this.waiting.push({ call, meanMicros, distribution, timerKind });
    this.host.setGauge(this.metrics.queueDepth, this.queued);
  }

  /** Called by the kernel when a piece of work ends, before its owner hears of it. */
  finish(): void {
    this.busyCores--;
    const next = this.waiting[this.waitingHead];
    if (next === undefined) {
      this.host.setGauge(this.metrics.utilisation, this.busyCores / this.cores);
      return;
    }
    this.waitingHead++;
    // Drop the served prefix once it is at least half the array, so memory follows the queue.
    if (this.waitingHead * 2 >= this.waiting.length) {
      this.waiting = this.waiting.slice(this.waitingHead);
      this.waitingHead = 0;
    }
    this.host.setGauge(this.metrics.queueDepth, this.queued);
    this.start(next.call, next.meanMicros, next.distribution, next.timerKind);
  }

  private start(call: Call, meanMicros: Micros, distribution: WorkDistribution, timerKind: number): void {
    this.busyCores++;
    this.host.setGauge(this.metrics.utilisation, this.busyCores / this.cores);
    const workMicros = distribution === "constant" ? meanMicros : Math.round(this.host.nextExponential(meanMicros));
    this.host.scheduleDone(workMicros, timerKind, call, this.index);
  }
}
