import { defineComponent } from "../../contract/component-definition.ts";
import type { Context } from "../../contract/context.ts";
import type { MetricHandle } from "../../contract/metric.ts";
import { CAPACITY_METRIC_IDS } from "../../contract/metric.ts";
import type { PortHandle } from "../../contract/port.ts";
import type { Call, Outcome } from "../../contract/request.ts";
import type { CpuHandle } from "../../contract/resources.ts";
import type { Micros } from "../../contract/time-units.ts";
import { microsToMilliseconds, millisecondsToMicros } from "../../contract/time-units.ts";
import type { ApiServerConfig } from "./definition.ts";
import { apiServerDatabaseConnectionFields, apiServerDefinition, CORES_BY_SIZE } from "./definition.ts";

const TIMER_CPU_DONE = 0;
const TIMER_WAIT_DONE = 1;

interface ApiServerState {
  readonly database: PortHandle;
  readonly utilisation: MetricHandle;
  readonly queueDepth: MetricHandle;
  readonly queueWait: MetricHandle;
  readonly completed: MetricHandle;
  readonly rejected: MetricHandle;
  readonly failed: MetricHandle;
  readonly databaseWait: MetricHandle;
  readonly cpu: CpuHandle;
  readonly meanCpuMicros: Micros;
  readonly meanWaitMicros: Micros;
  /** The database target of each query a request makes, in order. Empty with no database. */
  readonly queryTargets: Int32Array;
  busyWorkers: number;
  /** Calls waiting for a worker, oldest at `queueHead`. Entries before it have been served. */
  queue: Call[];
  queueHead: number;
}

type ApiServerContext = Context<ApiServerConfig, ApiServerState>;

/*
 * A request's path: wait for a worker → compute on a core (the kernel's CPU pool) → wait
 * on anything off the board → query each database in turn → answer and free the worker.
 * A stage with no time is skipped, so it costs no event.
 *
 * The call's `calleeScratchA` holds when it arrived; once its queries begin it holds when
 * they began, and `calleeScratchB` counts queries sent.
 */

function startWork(context: ApiServerContext, call: Call): void {
  const { state, config } = context;
  state.busyWorkers++;
  context.setGauge(state.utilisation, state.busyWorkers / config.workers);
  context.sample(state.queueWait, microsToMilliseconds(context.nowMicros - call.calleeScratchA));
  if (state.meanCpuMicros > 0) {
    context.useCpu(state.cpu, call, state.meanCpuMicros, config.timeDistribution, TIMER_CPU_DONE);
  } else {
    startOtherWait(context, call);
  }
}

function startOtherWait(context: ApiServerContext, call: Call): void {
  const { state, config } = context;
  if (state.meanWaitMicros === 0) {
    startQueries(context, call);
    return;
  }
  const waitMicros =
    config.timeDistribution === "constant"
      ? state.meanWaitMicros
      : Math.round(context.prng.nextExponential(state.meanWaitMicros));
  context.schedule(waitMicros, TIMER_WAIT_DONE, call);
}

function startQueries(context: ApiServerContext, call: Call): void {
  if (context.state.queryTargets.length === 0) {
    finish(context, call, "ok");
    return;
  }
  call.calleeScratchA = context.nowMicros;
  call.calleeScratchB = 0;
  sendNextQuery(context, call);
}

/** Sends the call's next query, the one `calleeScratchB` points at. */
function sendNextQuery(context: ApiServerContext, call: Call): void {
  const { state } = context;
  const step = call.calleeScratchB;
  call.calleeScratchB = step + 1;
  context.send(state.database, call.request, call, state.queryTargets[step]);
}

/** Answers a call, frees its worker and starts the oldest waiting call, if any. */
function finish(context: ApiServerContext, call: Call, outcome: Outcome): void {
  const { state, config } = context;
  state.busyWorkers--;
  context.count(outcome === "ok" ? state.completed : state.failed);
  context.reply(call, outcome);

  const next = state.queue[state.queueHead];
  if (next === undefined) {
    context.setGauge(state.utilisation, state.busyWorkers / config.workers);
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
  startWork(context, next);
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
        cpu: setup.cpu(CORES_BY_SIZE[setup.config.size], {
          utilisation: setup.metric("cpu.utilisation"),
          queueDepth: setup.metric("cpu.queue-depth"),
        }),
        meanCpuMicros: millisecondsToMicros(setup.config.cpuTimeMs),
        meanWaitMicros: millisecondsToMicros(setup.config.otherWaitMs),
        queryTargets: Int32Array.from(queryTargets),
        busyWorkers: 0,
        queue: [],
        queueHead: 0,
      };
    },

    onArrive(context, call) {
      const { state } = context;
      call.calleeScratchA = context.nowMicros;
      if (state.busyWorkers < context.config.workers) {
        startWork(context, call);
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

    onTimer(context, timerKind, call) {
      if (call === null) {
        return;
      }
      if (timerKind === TIMER_CPU_DONE) {
        startOtherWait(context, call);
      } else {
        startQueries(context, call);
      }
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
