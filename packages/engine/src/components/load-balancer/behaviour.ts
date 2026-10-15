import { defineComponent } from "../../contract/component-definition.ts";
import type { Context } from "../../contract/context.ts";
import type { MetricHandle } from "../../contract/metric.ts";
import { CAPACITY_METRIC_IDS } from "../../contract/metric.ts";
import type { PortHandle } from "../../contract/port.ts";
import type { Call, Outcome } from "../../contract/request.ts";
import type { Micros } from "../../contract/time-units.ts";
import { millisecondsToMicros, secondsToMicros } from "../../contract/time-units.ts";
import type { LoadBalancerConfig } from "./definition.ts";
import { loadBalancerConnectionFields, loadBalancerDefinition } from "./definition.ts";
import type { TargetTable } from "./target-selection.ts";
import { createTargetTable, NO_TARGET, pickTarget, recordResponseTime } from "./target-selection.ts";

const TIMER_FORWARD = 0;
const TIMER_EJECTION_END = 1;

/** How quickly least time forgets a slow response: Finagle's and Linkerd's default. */
const RESPONSE_TIME_DECAY_MICROS = secondsToMicros(10);

interface LoadBalancerState {
  readonly out: PortHandle;
  readonly utilisation: MetricHandle;
  readonly connectionsOpen: MetricHandle;
  readonly forwarded: MetricHandle;
  readonly retried: MetricHandle;
  readonly rejected: MetricHandle;
  readonly targetsEjected: MetricHandle;
  readonly ejections: MetricHandle;
  readonly latencyMicros: Micros;
  readonly ejectionMicros: Micros;
  readonly targets: TargetTable;
  readonly consecutiveFailures: Int32Array;
  readonly lastResponseAtMicros: Float64Array;
  openConnections: number;
  ejectedCount: number;
}

type LoadBalancerContext = Context<LoadBalancerConfig, LoadBalancerState>;

function setOpenConnections(context: LoadBalancerContext, openConnections: number): void {
  const { state } = context;
  state.openConnections = openConnections;
  context.setGauge(state.connectionsOpen, openConnections);
  context.setGauge(state.utilisation, openConnections / context.config.maxConnections);
}

/**
 * Sends an incoming request to a target. The outgoing call remembers the target in
 * `callerScratchA` and which try this is (1 for the first) in `callerScratchB`.
 */
function sendToTarget(context: LoadBalancerContext, incoming: Call, target: number, tryNumber: number): void {
  const { state } = context;
  state.targets.inFlight[target] = (state.targets.inFlight[target] ?? 0) + 1;
  context.count(state.forwarded);
  const outgoing = context.send(state.out, incoming.request, incoming, target);
  outgoing.callerScratchA = target;
  outgoing.callerScratchB = tryNumber;
}

function forward(context: LoadBalancerContext, incoming: Call): void {
  sendToTarget(context, incoming, pickTarget(context.state.targets, context.config.algorithm, NO_TARGET), 1);
}

/** Passive health check: enough failures in a row take the target out of rotation for a while. */
function recordOutcome(context: LoadBalancerContext, target: number, outcome: Outcome): void {
  const { state, config } = context;
  if (outcome === "ok") {
    state.consecutiveFailures[target] = 0;
    return;
  }
  const failures = (state.consecutiveFailures[target] ?? 0) + 1;
  state.consecutiveFailures[target] = failures;
  if (config.failuresToEject === 0 || failures < config.failuresToEject || state.targets.isEjected[target] === 1) {
    return;
  }
  state.targets.isEjected[target] = 1;
  context.count(state.ejections);
  context.setGauge(state.targetsEjected, ++state.ejectedCount);
  context.schedule(state.ejectionMicros, TIMER_EJECTION_END, null, target);
}

export const loadBalancerComponent = defineComponent({
  definition: loadBalancerDefinition,
  behaviour: {
    init(setup): LoadBalancerState {
      const out = setup.port("out");
      const connections = setup.connections(out, loadBalancerConnectionFields);
      return {
        out,
        utilisation: setup.metric(CAPACITY_METRIC_IDS.utilisation),
        connectionsOpen: setup.metric("connections.open"),
        forwarded: setup.metric("requests.forwarded"),
        retried: setup.metric("requests.retried"),
        rejected: setup.metric("requests.rejected"),
        targetsEjected: setup.metric("targets.ejected"),
        ejections: setup.metric("targets.ejections"),
        latencyMicros: millisecondsToMicros(setup.config.latencyMs),
        ejectionMicros: secondsToMicros(setup.config.ejectionSeconds),
        targets: createTargetTable(connections.map((connection) => connection.weight)),
        consecutiveFailures: new Int32Array(connections.length),
        lastResponseAtMicros: new Float64Array(connections.length),
        openConnections: 0,
        ejectedCount: 0,
      };
    },

    onArrive(context, call) {
      const { state, config } = context;
      if (state.targets.weight.length === 0 || state.openConnections >= config.maxConnections) {
        context.count(state.rejected);
        context.reply(call, "rejected");
        return;
      }
      setOpenConnections(context, state.openConnections + 1);
      if (state.latencyMicros === 0) {
        forward(context, call);
      } else {
        context.schedule(state.latencyMicros, TIMER_FORWARD, call);
      }
    },

    onTimer(context, timerKind, call, argument) {
      if (timerKind === TIMER_FORWARD && call !== null) {
        forward(context, call);
        return;
      }
      if (timerKind === TIMER_EJECTION_END) {
        const { state } = context;
        state.targets.isEjected[argument] = 0;
        state.consecutiveFailures[argument] = 0;
        context.setGauge(state.targetsEjected, --state.ejectedCount);
      }
    },

    onReply(context, call, outcome) {
      const { state, config } = context;
      const incoming = call.parent;
      const target = call.callerScratchA;
      const tryNumber = call.callerScratchB;
      state.targets.inFlight[target] = (state.targets.inFlight[target] ?? 1) - 1;

      if (outcome === "ok") {
        const sinceLastMicros = context.nowMicros - (state.lastResponseAtMicros[target] ?? 0);
        state.lastResponseAtMicros[target] = context.nowMicros;
        recordResponseTime(
          state.targets,
          target,
          context.nowMicros - call.sentAtMicros,
          sinceLastMicros,
          RESPONSE_TIME_DECAY_MICROS,
        );
      }
      recordOutcome(context, target, outcome);
      if (incoming === null) {
        return;
      }

      if (outcome === "rejected" && tryNumber < config.triesPerRequest) {
        const next = pickTarget(state.targets, config.algorithm, target);
        if (next !== NO_TARGET) {
          context.count(state.retried);
          sendToTarget(context, incoming, next, tryNumber + 1);
          return;
        }
      }
      setOpenConnections(context, state.openConnections - 1);
      context.reply(incoming, outcome);
    },
  },
});
