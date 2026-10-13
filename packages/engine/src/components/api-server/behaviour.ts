import { defineComponent } from "../../contract/component-definition.ts";
import type { Context } from "../../contract/context.ts";
import type { MetricHandle } from "../../contract/metric.ts";
import { CAPACITY_METRIC_IDS } from "../../contract/metric.ts";
import type { Call } from "../../contract/request.ts";
import type { Micros } from "../../contract/time-units.ts";
import { microsToMilliseconds, millisecondsToMicros } from "../../contract/time-units.ts";
import type { ApiServerConfig } from "./definition.ts";
import { apiServerDefinition } from "./definition.ts";

const TIMER_SERVICE_DONE = 0;

interface ApiServerState {
  readonly utilisation: MetricHandle;
  readonly queueDepth: MetricHandle;
  readonly queueWait: MetricHandle;
  readonly completed: MetricHandle;
  readonly rejected: MetricHandle;
  readonly slotCount: number;
  readonly meanServiceMicros: Micros;
  busySlots: number;
  /** Waiting calls, oldest at `queueHead`. Entries before it have been served. */
  queue: Call[];
  queueHead: number;
}

type ApiServerContext = Context<ApiServerConfig, ApiServerState>;

/** Starts work on a call. The call's `calleeScratchA` holds the time it arrived. */
function startService(context: ApiServerContext, call: Call): void {
  const { state, config } = context;
  state.busySlots++;
  context.setGauge(state.utilisation, state.busySlots / state.slotCount);
  context.sample(state.queueWait, microsToMilliseconds(context.nowMicros - call.calleeScratchA));
  const serviceMicros =
    config.serviceTimeDistribution === "constant"
      ? state.meanServiceMicros
      : Math.round(context.prng.nextExponential(state.meanServiceMicros));
  context.schedule(serviceMicros, TIMER_SERVICE_DONE, call);
}

export const apiServerComponent = defineComponent({
  definition: apiServerDefinition,
  behaviour: {
    init(setup): ApiServerState {
      return {
        utilisation: setup.metric(CAPACITY_METRIC_IDS.utilisation),
        queueDepth: setup.metric(CAPACITY_METRIC_IDS.queueDepth),
        queueWait: setup.metric("queue.wait"),
        completed: setup.metric("requests.completed"),
        rejected: setup.metric("requests.rejected"),
        slotCount: setup.config.instances * setup.config.concurrency,
        meanServiceMicros: millisecondsToMicros(setup.config.serviceTimeMs),
        busySlots: 0,
        queue: [],
        queueHead: 0,
      };
    },

    onArrive(context, call) {
      const { state } = context;
      call.calleeScratchA = context.nowMicros;
      if (state.busySlots < state.slotCount) {
        startService(context, call);
        return;
      }
      const waiting = state.queue.length - state.queueHead;
      if (waiting >= context.config.queueLimit) {
        context.count(state.rejected);
        context.reply(call, "rejected");
        return;
      }
      state.queue.push(call);
      context.setGauge(state.queueDepth, waiting + 1);
    },

    onTimer(context, _timerKind, call) {
      const { state } = context;
      if (call === null) {
        return;
      }
      state.busySlots--;
      context.count(state.completed);
      context.reply(call, "ok");

      const next = state.queue[state.queueHead];
      if (next === undefined) {
        context.setGauge(state.utilisation, state.busySlots / state.slotCount);
        return;
      }
      state.queueHead++;
      // Drop the served prefix once it is at least half the array, so the queue's
      // memory stays proportional to the number of calls actually waiting.
      if (state.queueHead * 2 >= state.queue.length) {
        state.queue = state.queue.slice(state.queueHead);
        state.queueHead = 0;
      }
      context.setGauge(state.queueDepth, state.queue.length - state.queueHead);
      startService(context, next);
    },
  },
});
