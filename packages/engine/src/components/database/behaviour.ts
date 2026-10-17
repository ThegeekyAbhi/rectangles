import { defineComponent } from "../../contract/component-definition.ts";
import type { Context } from "../../contract/context.ts";
import type { MetricHandle } from "../../contract/metric.ts";
import { CAPACITY_METRIC_IDS } from "../../contract/metric.ts";
import type { Call } from "../../contract/request.ts";
import type { CpuHandle } from "../../contract/resources.ts";
import type { Micros } from "../../contract/time-units.ts";
import { microsToMilliseconds, millisecondsToMicros } from "../../contract/time-units.ts";
import type { BufferCache } from "./buffer-cache.ts";
import { createBufferCache, touchRow } from "./buffer-cache.ts";
import type { CallQueue } from "./call-queue.ts";
import { createCallQueue, dequeue, enqueue, queueLength, removeFromQueue } from "./call-queue.ts";
import type { DatabaseConfig } from "./definition.ts";
import { databaseDefinition } from "./definition.ts";
import type { RowLocks } from "./row-locks.ts";
import { lockOrWait, stopWaiting, unlock } from "./row-locks.ts";

const TIMER_CONNECTION_WAIT_EXPIRED = 0;
const TIMER_LOCK_WAIT_EXPIRED = 1;
const TIMER_DISK_READ_DONE = 2;
const TIMER_QUERY_DONE = 3;

interface DatabaseState {
  readonly utilisation: MetricHandle;
  readonly queueDepth: MetricHandle;
  readonly connectionWait: MetricHandle;
  readonly locksWaitingGauge: MetricHandle;
  readonly lockWait: MetricHandle;
  readonly cacheHits: MetricHandle;
  readonly cacheMisses: MetricHandle;
  readonly reads: MetricHandle;
  readonly writes: MetricHandle;
  readonly rejected: MetricHandle;
  readonly failed: MetricHandle;
  readonly latency: MetricHandle;
  readonly connectionWaitTimeoutMicros: Micros;
  readonly lockWaitTimeoutMicros: Micros;
  readonly diskReadMicros: Micros;
  readonly meanReadMicros: Micros;
  readonly meanWriteMicros: Micros;
  readonly connectionQueue: CallQueue;
  readonly cpu: CpuHandle;
  readonly locks: RowLocks;
  readonly cache: BufferCache;
  connectionsInUse: number;
  locksWaiting: number;
}

type DatabaseContext = Context<DatabaseConfig, DatabaseState>;

/*
 * A query's path: wait for a connection → (a write) take its row's lock → read the row
 * from disk if it is not in memory → run on a core (the kernel's CPU pool) → release everything.
 *
 * While a query waits for a connection or a lock, its `calleeScratchB` holds the timer
 * that gives up on the wait, and `calleeScratchA` holds when the lock wait began. The
 * connection wait began when the query was sent, as links are instant.
 */

function setLocksWaiting(context: DatabaseContext, locksWaiting: number): void {
  context.state.locksWaiting = locksWaiting;
  context.setGauge(context.state.locksWaitingGauge, locksWaiting);
}

function acquireConnection(context: DatabaseContext, call: Call): void {
  const { state, config } = context;
  state.connectionsInUse++;
  context.setGauge(state.utilisation, state.connectionsInUse / config.maxConnections);
  context.sample(state.connectionWait, microsToMilliseconds(context.nowMicros - call.sentAtMicros));
  if (call.request.operation === "read") {
    fetchRow(context, call);
    return;
  }
  if (lockOrWait(state.locks, call.request.key, call)) {
    context.sample(state.lockWait, 0);
    fetchRow(context, call);
    return;
  }
  call.calleeScratchA = context.nowMicros;
  call.calleeScratchB = context.schedule(state.lockWaitTimeoutMicros, TIMER_LOCK_WAIT_EXPIRED, call);
  setLocksWaiting(context, state.locksWaiting + 1);
}

/** Brings the row into memory, from disk on a miss, then asks for a core. */
function fetchRow(context: DatabaseContext, call: Call): void {
  const { state } = context;
  if (touchRow(state.cache, call.request.key)) {
    context.count(state.cacheHits);
    execute(context, call);
    return;
  }
  context.count(state.cacheMisses);
  context.schedule(state.diskReadMicros, TIMER_DISK_READ_DONE, call);
}

/** Runs the query on a core, waiting for one if every core is busy. */
function execute(context: DatabaseContext, call: Call): void {
  const { state, config } = context;
  const meanMicros = call.request.operation === "read" ? state.meanReadMicros : state.meanWriteMicros;
  context.useCpu(state.cpu, call, meanMicros, config.queryTimeDistribution, TIMER_QUERY_DONE);
}

/** The query has run; the kernel has already given its core to the next waiting query. */
function finishExecution(context: DatabaseContext, call: Call): void {
  const { state } = context;
  if (call.request.operation === "read") {
    context.count(state.reads);
  } else {
    context.count(state.writes);
    handOverLock(context, call.request.key);
  }
  context.sample(state.latency, microsToMilliseconds(context.nowMicros - call.sentAtMicros));
  context.reply(call, "ok");
  releaseConnection(context);
}

/** Gives a released row's lock to the oldest write waiting for it. */
function handOverLock(context: DatabaseContext, key: number): void {
  const { state } = context;
  const next = unlock(state.locks, key);
  if (next === null) {
    return;
  }
  context.cancel(next.calleeScratchB);
  setLocksWaiting(context, state.locksWaiting - 1);
  context.sample(state.lockWait, microsToMilliseconds(context.nowMicros - next.calleeScratchA));
  fetchRow(context, next);
}

/** Frees a connection and gives it to the oldest query waiting for one. */
function releaseConnection(context: DatabaseContext): void {
  const { state, config } = context;
  state.connectionsInUse--;
  const next = dequeue(state.connectionQueue);
  if (next === null) {
    context.setGauge(state.utilisation, state.connectionsInUse / config.maxConnections);
    return;
  }
  context.cancel(next.calleeScratchB);
  context.setGauge(state.queueDepth, queueLength(state.connectionQueue));
  acquireConnection(context, next);
}

export const databaseComponent = defineComponent({
  definition: databaseDefinition,
  behaviour: {
    init(setup): DatabaseState {
      const { config } = setup;
      return {
        utilisation: setup.metric(CAPACITY_METRIC_IDS.utilisation),
        queueDepth: setup.metric(CAPACITY_METRIC_IDS.queueDepth),
        connectionWait: setup.metric("connections.wait"),
        locksWaitingGauge: setup.metric("locks.waiting"),
        lockWait: setup.metric("locks.wait"),
        cacheHits: setup.metric("buffer-cache.hits"),
        cacheMisses: setup.metric("buffer-cache.misses"),
        reads: setup.metric("queries.reads"),
        writes: setup.metric("queries.writes"),
        rejected: setup.metric("queries.rejected"),
        failed: setup.metric("queries.failed"),
        latency: setup.metric("query.latency"),
        connectionWaitTimeoutMicros: millisecondsToMicros(config.connectionWaitTimeoutMs),
        lockWaitTimeoutMicros: millisecondsToMicros(config.lockWaitTimeoutMs),
        diskReadMicros: millisecondsToMicros(config.diskReadMs),
        meanReadMicros: millisecondsToMicros(config.readTimeMs),
        meanWriteMicros: millisecondsToMicros(config.writeTimeMs),
        connectionQueue: createCallQueue(),
        cpu: setup.cpu(config.cpuCores, {
          utilisation: setup.metric("cpu.utilisation"),
          queueDepth: setup.metric("cpu.queue-depth"),
        }),
        locks: new Map(),
        cache: createBufferCache(config.rowsInMemory),
        connectionsInUse: 0,
        locksWaiting: 0,
      };
    },

    onArrive(context, call) {
      const { state, config } = context;
      if (state.connectionsInUse < config.maxConnections) {
        acquireConnection(context, call);
        return;
      }
      const waiting = queueLength(state.connectionQueue);
      if (waiting >= config.connectionQueueLimit) {
        context.count(state.rejected);
        context.reply(call, "rejected");
        return;
      }
      enqueue(state.connectionQueue, call);
      call.calleeScratchB = context.schedule(
        state.connectionWaitTimeoutMicros,
        TIMER_CONNECTION_WAIT_EXPIRED,
        call,
      );
      context.setGauge(state.queueDepth, waiting + 1);
    },

    onTimer(context, timerKind, call) {
      if (call === null) {
        return;
      }
      const { state } = context;
      if (timerKind === TIMER_QUERY_DONE) {
        finishExecution(context, call);
      } else if (timerKind === TIMER_DISK_READ_DONE) {
        execute(context, call);
      } else if (timerKind === TIMER_CONNECTION_WAIT_EXPIRED) {
        removeFromQueue(state.connectionQueue, call);
        context.setGauge(state.queueDepth, queueLength(state.connectionQueue));
        context.count(state.rejected);
        context.reply(call, "rejected");
      } else if (timerKind === TIMER_LOCK_WAIT_EXPIRED) {
        stopWaiting(state.locks, call.request.key, call);
        setLocksWaiting(context, state.locksWaiting - 1);
        context.count(state.failed);
        context.reply(call, "failed");
        releaseConnection(context);
      }
    },
  },
});
