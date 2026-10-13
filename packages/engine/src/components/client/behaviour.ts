import { defineComponent } from "../../contract/component-definition.ts";
import type { Context } from "../../contract/context.ts";
import type { MetricHandle } from "../../contract/metric.ts";
import { END_TO_END_METRIC_IDS } from "../../contract/metric.ts";
import type { PortHandle } from "../../contract/port.ts";
import type { Call, Outcome } from "../../contract/request.ts";
import type { Micros } from "../../contract/time-units.ts";
import {
  MICROS_PER_SECOND,
  microsToMilliseconds,
  microsToSeconds,
  millisecondsToMicros,
} from "../../contract/time-units.ts";
import type { ClientConfig } from "./definition.ts";
import { clientDefinition } from "./definition.ts";
import { peakRatePerSecond, rateAtSeconds } from "./traffic-pattern.ts";

const TIMER_ARRIVAL = 0;
const TIMER_TIMEOUT = 1;
const TIMER_RETRY = 2;

/** Value of `callerScratchB` once the client has stopped waiting for a call. */
const ABANDONED = 1;

interface ClientState {
  readonly out: PortHandle;
  readonly offered: MetricHandle;
  readonly succeeded: MetricHandle;
  readonly rejected: MetricHandle;
  readonly failed: MetricHandle;
  readonly timedOut: MetricHandle;
  readonly inFlightGauge: MetricHandle;
  readonly latency: MetricHandle;
  readonly peakRatePerSecond: number;
  /** Mean gap between candidate arrivals at the peak rate. */
  readonly meanCandidateGapMicros: Micros;
  readonly timeoutMicros: Micros;
  readonly retryBackoffMicros: Micros;
  inFlight: number;
  nextTargetIndex: number;
}

type ClientContext = Context<ClientConfig, ClientState>;

function scheduleNextCandidate(context: ClientContext): void {
  const gapMicros = Math.round(context.prng.nextExponential(context.state.meanCandidateGapMicros));
  context.schedule(gapMicros, TIMER_ARRIVAL);
}

function sendRequest(context: ClientContext, attempt: number): void {
  const { state } = context;
  const targetCount = context.targetCount(state.out);
  const targetIndex = state.nextTargetIndex;
  state.nextTargetIndex = (targetIndex + 1) % targetCount;

  context.count(state.offered);
  context.setGauge(state.inFlightGauge, ++state.inFlight);
  const call = context.send(state.out, context.createRequest(attempt), null, targetIndex);
  call.callerScratchA = context.schedule(state.timeoutMicros, TIMER_TIMEOUT, call);
}

function retryIfAllowed(context: ClientContext, attempt: number): void {
  if (attempt < context.config.retries) {
    const backoffMicros = context.state.retryBackoffMicros * 2 ** attempt;
    context.schedule(backoffMicros, TIMER_RETRY, null, attempt + 1);
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
  retryIfAllowed(context, call.request.attempt);
}

export const clientComponent = defineComponent({
  definition: clientDefinition,
  behaviour: {
    init(setup): ClientState {
      const peak = peakRatePerSecond(setup.config);
      return {
        out: setup.port("out"),
        offered: setup.metric(END_TO_END_METRIC_IDS.offered),
        succeeded: setup.metric(END_TO_END_METRIC_IDS.succeeded),
        rejected: setup.metric(END_TO_END_METRIC_IDS.rejected),
        failed: setup.metric(END_TO_END_METRIC_IDS.failed),
        timedOut: setup.metric(END_TO_END_METRIC_IDS.timedOut),
        inFlightGauge: setup.metric(END_TO_END_METRIC_IDS.inFlight),
        latency: setup.metric(END_TO_END_METRIC_IDS.latency),
        peakRatePerSecond: peak,
        meanCandidateGapMicros: peak > 0 ? MICROS_PER_SECOND / peak : 0,
        timeoutMicros: millisecondsToMicros(setup.config.timeoutMs),
        retryBackoffMicros: millisecondsToMicros(setup.config.retryBackoffMs),
        inFlight: 0,
        nextTargetIndex: 0,
      };
    },

    onStart(context) {
      if (context.state.peakRatePerSecond > 0 && context.targetCount(context.state.out) > 0) {
        scheduleNextCandidate(context);
      }
    },

    onTimer(context, timerKind, call, argument) {
      if (timerKind === TIMER_ARRIVAL) {
        // Thinning: candidates arrive as a Poisson process at the peak rate and each is
        // kept with probability rate(now) / peak, which yields a Poisson process whose
        // rate follows the pattern exactly.
        const { peakRatePerSecond: peak } = context.state;
        const rate = rateAtSeconds(context.config, microsToSeconds(context.nowMicros));
        if (rate >= peak || context.prng.nextFloat() * peak < rate) {
          sendRequest(context, 0);
        }
        scheduleNextCandidate(context);
      } else if (timerKind === TIMER_RETRY) {
        sendRequest(context, argument);
      } else if (timerKind === TIMER_TIMEOUT && call !== null) {
        // The work already in flight still runs; only the client stops waiting.
        call.callerScratchB = ABANDONED;
        finishAttempt(context, "timed-out", call);
      }
    },

    onReply(context, call, outcome) {
      if (call.callerScratchB === ABANDONED) {
        return;
      }
      context.cancel(call.callerScratchA);
      finishAttempt(context, outcome, call);
    },
  },
});
