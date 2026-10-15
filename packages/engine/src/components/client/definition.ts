import { formatCompactNumber } from "../../contract/compact-number.ts";
import type { ComponentDefinition } from "../../contract/component-definition.ts";
import type { ConfigFields, ConfigOf } from "../../contract/config-field.ts";
import { END_TO_END_METRIC_IDS } from "../../contract/metric.ts";
import { requestsBy } from "./traffic-pattern.ts";

const CHANGING_PATTERNS = ["ramp", "spike", "step"] as const;

export const clientConfigFields = {
  pattern: {
    kind: "choice",
    label: "Traffic pattern",
    description:
      "Shape of the load over time: steady, a linear ramp, a temporary spike, or a permanent step.",
    options: ["steady", "ramp", "spike", "step"],
    default: "steady",
  },
  ratePerSecond: {
    kind: "number",
    label: "Rate",
    description: "Average requests generated per second before any change.",
    unit: "requests/s",
    default: 100,
    min: 0,
    max: 1_000_000,
  },
  targetRatePerSecond: {
    kind: "number",
    label: "Target rate",
    description: "Rate the pattern moves to: the end of a ramp, the height of a spike, or the new step level.",
    unit: "requests/s",
    default: 500,
    min: 0,
    max: 1_000_000,
    relevantWhen: { field: "pattern", isOneOf: CHANGING_PATTERNS },
  },
  changeAtSeconds: {
    kind: "number",
    label: "Change at",
    description: "When the ramp, spike or step begins.",
    unit: "s",
    default: 10,
    min: 0,
    max: 600,
    relevantWhen: { field: "pattern", isOneOf: CHANGING_PATTERNS },
  },
  changeDurationSeconds: {
    kind: "number",
    label: "Change duration",
    description: "How long a ramp takes to reach its target, or how long a spike lasts.",
    unit: "s",
    default: 10,
    min: 0,
    max: 600,
    relevantWhen: { field: "pattern", isOneOf: ["ramp", "spike"] },
  },
  timeoutMs: {
    kind: "number",
    label: "Timeout",
    description: "How long the client waits for an answer before giving up.",
    unit: "ms",
    default: 5_000,
    min: 1,
    max: 600_000,
  },
  retries: {
    kind: "integer",
    label: "Retries",
    description: "Extra attempts after a rejected, failed or timed-out request. Each retry adds load.",
    default: 0,
    min: 0,
    max: 10,
  },
  readRatio: {
    kind: "number",
    label: "Read share",
    description: "Fraction of requests that read data; the rest write it. Writes are slower and lock their row.",
    default: 0.9,
    min: 0,
    max: 1,
  },
  keyCount: {
    kind: "integer",
    label: "Keys",
    description: "Distinct items of data (rows, users, products) the requests touch.",
    default: 10_000,
    min: 1,
    max: 10_000_000,
  },
  keySkew: {
    kind: "number",
    label: "Key skew",
    description:
      "How unevenly requests pick keys (Zipf exponent). 0 is even; 1 means a few hot keys get most traffic, like real sites.",
    default: 1,
    min: 0,
    max: 4,
  },
  retryBackoffMs: {
    kind: "number",
    label: "Retry backoff",
    description: "Wait before the first retry. It doubles on each further retry.",
    unit: "ms",
    default: 100,
    min: 0,
    max: 60_000,
  },
} as const satisfies ConfigFields;

export type ClientConfig = ConfigOf<typeof clientConfigFields>;

export const clientDefinition: ComponentDefinition<typeof clientConfigFields> = {
  type: "client",
  label: "Client",
  description: "Generates requests and measures what comes back.",
  category: "traffic",
  configFields: clientConfigFields,
  summarise(config) {
    const rate = formatCompactNumber(config.ratePerSecond);
    return config.pattern === "steady"
      ? `${rate} req/s · steady`
      : `${rate} → ${formatCompactNumber(config.targetRatePerSecond)} req/s · ${config.pattern}`;
  },
  expectedRequests(config, seconds, targetCount) {
    // Each target gets its own stream at the full rate.
    return requestsBy(config, seconds) * targetCount;
  },
  ports: [
    {
      id: "out",
      direction: "out",
      protocol: "sync-request",
      description: "Requests sent to the system. Each target gets the full rate; put a load balancer in front of several servers to split it.",
    },
  ],
  metrics: [
    {
      id: END_TO_END_METRIC_IDS.offered,
      kind: "counter",
      unit: "requests",
      definition: "Requests the client generated, including retries.",
    },
    {
      id: END_TO_END_METRIC_IDS.succeeded,
      kind: "counter",
      unit: "requests",
      definition: "Requests answered successfully before the client's timeout.",
    },
    {
      id: END_TO_END_METRIC_IDS.rejected,
      kind: "counter",
      unit: "requests",
      definition: "Requests the system refused before starting work, such as when a queue is full.",
    },
    {
      id: END_TO_END_METRIC_IDS.failed,
      kind: "counter",
      unit: "requests",
      definition: "Requests the system accepted and then lost.",
    },
    {
      id: END_TO_END_METRIC_IDS.timedOut,
      kind: "counter",
      unit: "requests",
      definition: "Requests the client gave up on because no answer came within the timeout.",
    },
    {
      id: END_TO_END_METRIC_IDS.inFlight,
      kind: "gauge",
      unit: "requests",
      definition: "Requests sent and still waiting for an answer.",
    },
    {
      id: END_TO_END_METRIC_IDS.latency,
      kind: "sample",
      unit: "ms",
      definition: "Time from sending a request to receiving its successful answer.",
    },
  ],
  notModeled: [
    "Network latency and packet loss between the client and the system.",
    "Connection setup, keep-alive and connection limits.",
    "Latency across retries: each attempt is timed on its own.",
    "Retry jitter and retry budgets.",
    "Keys that change popularity over time: the hot keys stay hot for the whole run.",
  ],
};
