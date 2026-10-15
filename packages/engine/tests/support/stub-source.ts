import { defineComponent } from "../../src/contract/component-definition.ts";
import type { ConfigFields } from "../../src/contract/config-field.ts";
import { millisecondsToMicros, secondsToMicros } from "../../src/contract/time-units.ts";

const configFields = {
  intervalMs: {
    kind: "number",
    label: "Interval",
    description: "Fixed gap between calls.",
    unit: "ms",
    default: 10,
    min: 0.001,
    max: 600_000,
  },
  stopAfterSeconds: {
    kind: "number",
    label: "Stop after",
    description: "Stops sending once this much time has passed.",
    unit: "s",
    default: 600,
    min: 0,
    max: 600,
  },
} as const satisfies ConfigFields;

/** Test stand-in for anything upstream: sends a call at a fixed interval. */
export const stubSourceComponent = defineComponent({
  definition: {
    type: "stub-source",
    label: "Stub source",
    category: "traffic",
    description: "Sends calls at a fixed interval.",
    configFields,
    summarise: (config) => `every ${config.intervalMs} ms`,
    ports: [{ id: "out", direction: "out", protocol: "sync-request", description: "Calls sent." }],
    metrics: [
      { id: "calls.sent", kind: "counter", unit: "calls", definition: "Calls sent." },
      { id: "calls.answered", kind: "counter", unit: "calls", definition: "Calls answered." },
    ],
    notModeled: [],
  },
  behaviour: {
    init(setup) {
      return {
        out: setup.port("out"),
        sent: setup.metric("calls.sent"),
        answered: setup.metric("calls.answered"),
        intervalMicros: millisecondsToMicros(setup.config.intervalMs),
        stopAtMicros: secondsToMicros(setup.config.stopAfterSeconds),
      };
    },
    onStart(context) {
      if (context.targetCount(context.state.out) > 0) {
        context.schedule(0, 0);
      }
    },
    onTimer(context) {
      const { state } = context;
      if (context.nowMicros >= state.stopAtMicros) {
        return;
      }
      context.count(state.sent);
      context.send(state.out, context.createRequest(0));
      context.schedule(state.intervalMicros, 0);
    },
    onReply(context) {
      context.count(context.state.answered);
    },
  },
});
