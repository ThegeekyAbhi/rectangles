import { defineComponent } from "../../contract/component-definition.ts";
import type { Context } from "../../contract/context.ts";
import type { MetricHandle } from "../../contract/metric.ts";
import { END_TO_END_METRIC_IDS } from "../../contract/metric.ts";
import type { PortHandle } from "../../contract/port.ts";
import type { Call, Operation, Outcome, Request } from "../../contract/request.ts";
import type { Micros } from "../../contract/time-units.ts";
import type { KeySampler } from "../../contract/zipf.ts";
import { createZipfSampler } from "../../contract/zipf.ts";
import {
  MICROS_PER_SECOND,
  microsToMilliseconds,
  microsToSeconds,
  millisecondsToMicros,
  secondsToMicros,
} from "../../contract/time-units.ts";
import type { ClientConfig } from "./definition.ts";
import { clientConfigFields, clientDefinition } from "./definition.ts";
import { rateAtSeconds, trafficSegmentAt } from "./traffic-pattern.ts";

const TIMER_ARRIVAL = 0;
const TIMER_TIMEOUT = 1;
const TIMER_RETRY = 2;
const TIMER_SEGMENT_START = 3;

/**
 * A call's `callerScratchA` holds its timeout timer, then this once the timeout has fired
 * and the client has stopped waiting. Its `callerScratchB` holds the target's index.
 */
const ABANDONED = -1;

/**
 * A retry timer's argument packs the key, the operation, the target and the attempt, so a
 * retry repeats exactly what failed. Attempts never reach this.
 */
const ATTEMPTS_PER_TARGET = clientConfigFields.retries.max + 1;

interface ClientState {
  readonly out: PortHandle;
  readonly offered: MetricHandle;
  readonly succeeded: MetricHandle;
  readonly rejected: MetricHandle;
  readonly failed: MetricHandle;
  readonly timedOut: MetricHandle;
  readonly inFlightGauge: MetricHandle;
  readonly latency: MetricHandle;
  readonly timeoutMicros: Micros;
  readonly retryBackoffMicros: Micros;
  readonly drawKey: KeySampler;
  targetCount: number;
  inFlight: number;
}

type ClientContext = Context<ClientConfig, ClientState>;

/**
 * The stretch of the pattern in force at `nowMicros`, with its end in whole microseconds.
 * A stretch whose end rounds to now or earlier is already over, so the next one is used;
 * otherwise a boundary landing within half a microsecond of now would never be passed.
 */
function currentSegment(config: ClientConfig, nowMicros: Micros): { peakRatePerSecond: number; endMicros: Micros } {
  let segment = trafficSegmentAt(config, microsToSeconds(nowMicros));
  let endMicros = secondsToMicros(segment.endSeconds);
  while (endMicros <= nowMicros) {
    segment = trafficSegmentAt(config, segment.endSeconds);
    endMicros = secondsToMicros(segment.endSeconds);
  }
  return { peakRatePerSecond: segment.peakRatePerSecond, endMicros };
}

/**
 * Schedules the next candidate arrival, drawn at the current stretch's peak rate times
 * the number of targets. A candidate that would land past the stretch's end is dropped
 * and drawing restarts there: arrivals are memoryless, so this is exact, and no events
 * are spent on candidates a quieter stretch would mostly reject.
 */
function scheduleNextCandidate(context: ClientContext): void {
  const { nowMicros, state } = context;
  const { peakRatePerSecond, endMicros } = currentSegment(context.config, nowMicros);
  const candidatesPerSecond = peakRatePerSecond * state.targetCount;
  if (candidatesPerSecond > 0) {
    const gapMicros = Math.round(context.prng.nextExponential(MICROS_PER_SECOND / candidatesPerSecond));
    if (nowMicros + gapMicros < endMicros) {
      context.schedule(gapMicros, TIMER_ARRIVAL);
      return;
    }
  }
  if (endMicros !== Number.POSITIVE_INFINITY) {
    context.schedule(endMicros - nowMicros, TIMER_SEGMENT_START);
  }
}

/**
 * Each target gets its own stream at the full configured rate: connecting a second
 * server adds load rather than splitting it. Spreading one stream over several servers
 * is a load balancer's job.
 *
 * One Poisson stream at `targetCount` times the rate, with each arrival sent to a target
 * chosen uniformly, is the same as one independent Poisson stream per target.
 */
function pickTarget(context: ClientContext): number {
  const { targetCount } = context.state;
  return targetCount === 1 ? 0 : Math.floor(context.prng.nextFloat() * targetCount);
}

function sendRequest(
  context: ClientContext,
  targetIndex: number,
  attempt: number,
  operation: Operation,
  key: number,
): void {
  const { state } = context;
  context.count(state.offered);
  context.setGauge(state.inFlightGauge, ++state.inFlight);
  const call = context.send(state.out, context.createRequest(attempt, operation, key), null, targetIndex);
  call.callerScratchA = context.schedule(state.timeoutMicros, TIMER_TIMEOUT, call);
  call.callerScratchB = targetIndex;
}

function sendNewRequest(context: ClientContext, targetIndex: number): void {
  const operation = context.prng.nextFloat() < context.config.readRatio ? "read" : "write";
  sendRequest(context, targetIndex, 0, operation, context.state.drawKey(context.prng));
}

/** Packs a retry into one timer argument. Stays well inside the safe-integer range. */
function packRetry(context: ClientContext, request: Request, targetIndex: number): number {
  const keyAndOperation = request.key * 2 + (request.operation === "write" ? 1 : 0);
  const targetSlot = keyAndOperation * context.state.targetCount + targetIndex;
  return targetSlot * ATTEMPTS_PER_TARGET + request.attempt + 1;
}

function sendRetry(context: ClientContext, packed: number): void {
  const attempt = packed % ATTEMPTS_PER_TARGET;
  const targetSlot = Math.floor(packed / ATTEMPTS_PER_TARGET);
  const targetIndex = targetSlot % context.state.targetCount;
  const keyAndOperation = Math.floor(targetSlot / context.state.targetCount);
  const operation = keyAndOperation % 2 === 1 ? "write" : "read";
  sendRequest(context, targetIndex, attempt, operation, Math.floor(keyAndOperation / 2));
}

/** A retry goes to the same target as the attempt before it, for the same key. */
function retryIfAllowed(context: ClientContext, targetIndex: number, request: Request): void {
  if (request.attempt < context.config.retries) {
    const backoffMicros = context.state.retryBackoffMicros * 2 ** request.attempt;
    context.schedule(backoffMicros, TIMER_RETRY, null, packRetry(context, request, targetIndex));
  }
}

function finishAttempt(context: ClientContext, outcome: Outcome, call: Call): void {
  const { state } = context;
  context.setGauge(state.inFlightGauge, --state.inFlight);
  if (outcome === "ok") {
    context.count(state.succeeded);
    context.sample(state.latency, microsToMilliseconds(context.nowMicros - call.sentAtMicros));
    return;
  }
  context.count(
    outcome === "rejected" ? state.rejected : outcome === "failed" ? state.failed : state.timedOut,
  );
  retryIfAllowed(context, call.callerScratchB, call.request);
}

export const clientComponent = defineComponent({
  definition: clientDefinition,
  behaviour: {
    init(setup): ClientState {
      return {
        out: setup.port("out"),
        offered: setup.metric(END_TO_END_METRIC_IDS.offered),
        succeeded: setup.metric(END_TO_END_METRIC_IDS.succeeded),
        rejected: setup.metric(END_TO_END_METRIC_IDS.rejected),
        failed: setup.metric(END_TO_END_METRIC_IDS.failed),
        timedOut: setup.metric(END_TO_END_METRIC_IDS.timedOut),
        inFlightGauge: setup.metric(END_TO_END_METRIC_IDS.inFlight),
        latency: setup.metric(END_TO_END_METRIC_IDS.latency),
        timeoutMicros: millisecondsToMicros(setup.config.timeoutMs),
        retryBackoffMicros: millisecondsToMicros(setup.config.retryBackoffMs),
        drawKey: createZipfSampler(setup.config.keyCount, setup.config.keySkew),
        targetCount: 0,
        inFlight: 0,
      };
    },

    onStart(context) {
      const { state } = context;
      state.targetCount = context.targetCount(state.out);
      if (state.targetCount > 0) {
        scheduleNextCandidate(context);
      }
    },

    onTimer(context, timerKind, call, argument) {
      if (timerKind === TIMER_ARRIVAL) {
        // Thinning: candidates arrive as a Poisson process at the stretch's peak rate and
        // each is kept with probability rate(now) / peak, which yields a Poisson process
        // whose rate follows the pattern exactly.
        const peak = currentSegment(context.config, context.nowMicros).peakRatePerSecond;
        const rate = rateAtSeconds(context.config, microsToSeconds(context.nowMicros));
        const targetIndex = pickTarget(context);
        if (rate >= peak || context.prng.nextFloat() * peak < rate) {
          sendNewRequest(context, targetIndex);
        }
        scheduleNextCandidate(context);
      } else if (timerKind === TIMER_SEGMENT_START) {
        scheduleNextCandidate(context);
      } else if (timerKind === TIMER_RETRY) {
        sendRetry(context, argument);
      } else if (timerKind === TIMER_TIMEOUT && call !== null) {
        // The work already in flight still runs; only the client stops waiting.
        call.callerScratchA = ABANDONED;
        finishAttempt(context, "timed-out", call);
      }
    },

    onReply(context, call, outcome) {
      if (call.callerScratchA === ABANDONED) {
        return;
      }
      context.cancel(call.callerScratchA);
      finishAttempt(context, outcome, call);
    },
  },
});
