import { defineComponent } from "../../contract/component-definition.ts";
import type { Context } from "../../contract/context.ts";
import type { MetricHandle } from "../../contract/metric.ts";
import { CAPACITY_METRIC_IDS } from "../../contract/metric.ts";
import type { PortHandle } from "../../contract/port.ts";
import type { Call, Outcome } from "../../contract/request.ts";
import type { Micros } from "../../contract/time-units.ts";
import { microsToMilliseconds, millisecondsToMicros } from "../../contract/time-units.ts";
import type { ApiServerConfig } from "./definition.ts";
import { apiServerDatabaseConnectionFields, apiServerDefinition } from "./definition.ts";

const TIMER_SERVICE_DONE = 0;

interface ApiServerState {
  readonly database: PortHandle;
  readonly utilisation: MetricHandle;
  readonly queueDepth: MetricHandle;
  readonly queueWait: MetricHandle;
  readonly completed: MetricHandle;
  readonly rejected: MetricHandle;
  readonly failed: MetricHandle;
  readonly databaseWait: MetricHandle;
  readonly slotCount: number;
  readonly meanServiceMicros: Micros;
  /** The database target of each query a request makes, in order. Empty with no database. */
  readonly queryTargets: Int32Array;
  busySlots: number;
  /** Waiting calls, oldest at `queueHead`. Entries before it have been served. */
  queue: Call[];
  queueHead: number;
}

type ApiServerContext = Context<ApiServerConfig, ApiServerState>;

/**
 * Starts work on a call. The call's `calleeScratchA` holds the time it arrived; once its
 * queries begin it holds when they began, and `calleeScratchB` counts queries sent.
 */
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

/** Sends the call's next query, the one `calleeScratchB` points at. */
function sendNextQuery(context: ApiServerContext, call: Call): void {
  const { state } = context;
  const step = call.calleeScratchB;
  call.calleeScratchB = step + 1;
  context.send(state.database, call.request, call, state.queryTargets[step]);
}

/** Answers a call, frees its slot and starts the oldest waiting call, if any. */
function finish(context: ApiServerContext, call: Call, outcome: Outcome): void {
  const { state } = context;
  state.busySlots--;
  context.count(outcome === "ok" ? state.completed : state.failed);
  context.reply(call, outcome);

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
}

export const apiServerComponent = defineComponent({
  definition: apiServerDefinition,
  behaviour: {
    init(setup): ApiServerState {
      const database = setup.port("database");
      // Each request queries every connected database in turn, as many times as its
      // connection says.
      const queryTargets = setup
        .connections(database, apiServerDatabaseConnectionFields)
        .flatMap((connection, target) => Array.from({ length: connection.queriesPerRequest }, () => target));
      return {
        database,
        utilisation: setup.metric(CAPACITY_METRIC_IDS.utilisation),
        queueDepth: setup.metric(CAPACITY_METRIC_IDS.queueDepth),
        queueWait: setup.metric("queue.wait"),
        completed: setup.metric("requests.completed"),
        rejected: setup.metric("requests.rejected"),
        failed: setup.metric("requests.failed"),
        databaseWait: setup.metric("database.wait"),
        slotCount: setup.config.instances * setup.config.concurrency,
        meanServiceMicros: millisecondsToMicros(setup.config.serviceTimeMs),
        queryTargets: Int32Array.from(queryTargets),
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
      if (call === null) {
        return;
      }
      if (context.state.queryTargets.length === 0) {
        finish(context, call, "ok");
        return;
      }
      call.calleeScratchA = context.nowMicros;
      call.calleeScratchB = 0;
      sendNextQuery(context, call);
    },

    onReply(context, query, outcome) {
      const { state } = context;
      const call = query.parent;
      if (call === null) {
        return;
      }
      if (outcome === "ok" && call.calleeScratchB < state.queryTargets.length) {
        sendNextQuery(context, call);
        return;
      }
      context.sample(state.databaseWait, microsToMilliseconds(context.nowMicros - call.calleeScratchA));
      // The request was accepted, so a refused query fails it rather than rejecting it.
      finish(context, call, outcome === "ok" ? "ok" : "failed");
    },
  },
});
