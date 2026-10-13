import { defineComponent } from "../../src/contract/component-definition.ts";
import type { ConfigFields } from "../../src/contract/config-field.ts";
import { millisecondsToMicros } from "../../src/contract/time-units.ts";

const configFields = {
  delayMs: {
    kind: "number",
    label: "Delay",
    description: "Fixed time before answering.",
    unit: "ms",
    default: 0,
    min: 0,
    max: 600_000,
  },
} as const satisfies ConfigFields;

/** Test stand-in for anything downstream: answers every call after a fixed delay. */
export const stubSinkComponent = defineComponent({
  definition: {
    type: "stub-sink",
    label: "Stub sink",
    description: "Answers every call after a fixed delay.",
    configFields,
    summarise: (config) => `${config.delayMs} ms delay`,
    ports: [{ id: "in", direction: "in", protocol: "sync-request", description: "Calls received." }],
    metrics: [
      { id: "calls.received", kind: "counter", unit: "calls", definition: "Calls received." },
    ],
    notModeled: [],
  },
  behaviour: {
    init(setup) {
      return {
        received: setup.metric("calls.received"),
        delayMicros: millisecondsToMicros(setup.config.delayMs),
      };
    },
    onArrive(context, call) {
      context.count(context.state.received);
      context.schedule(context.state.delayMicros, 0, call);
    },
    onTimer(context, _timerKind, call) {
      if (call !== null) {
        context.reply(call, "ok");
      }
    },
  },
});
