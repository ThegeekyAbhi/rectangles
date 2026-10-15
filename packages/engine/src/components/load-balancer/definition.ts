import { formatCompactNumber } from "../../contract/compact-number.ts";
import type { ComponentDefinition } from "../../contract/component-definition.ts";
import type { ConfigFields, ConfigOf } from "../../contract/config-field.ts";
import { CAPACITY_METRIC_IDS } from "../../contract/metric.ts";

export const loadBalancerConfigFields = {
  algorithm: {
    kind: "choice",
    label: "Algorithm",
    description: "How the next target is picked. Every algorithm respects the connections' weights.",
    // NGINX's names. Random and power of two choices only differ from these when several
    // load balancers share the same targets, which is not modelled.
    options: ["round-robin", "least-connections", "least-time"],
    optionDescriptions: {
      "round-robin":
        "Takes turns in proportion to weight, whatever each target is doing. Simple and even, but keeps sending to a target that has fallen behind.",
      "least-connections":
        "Picks the target with the fewest requests in flight for its weight. Same as round robin while every target keeps up; sends less to one that falls behind.",
      "least-time":
        "Picks the target with the lowest recent response time × requests in flight. Moves traffic away from a slow target before its queue builds up.",
    },
    default: "round-robin",
  },
  latencyMs: {
    kind: "number",
    label: "Added latency",
    description: "Time the load balancer adds to each request before forwarding it.",
    unit: "ms",
    default: 0.5,
    min: 0,
    max: 1_000,
  },
  maxConnections: {
    kind: "integer",
    label: "Max connections",
    description: "Requests the load balancer holds open at once. Further requests are rejected.",
    default: 10_000,
    min: 1,
    max: 1_000_000,
  },
  triesPerRequest: {
    kind: "integer",
    label: "Tries per request",
    description:
      "Targets tried before giving up when a target refuses a request. 1 means no retry. Each retry goes to a different target.",
    default: 2,
    min: 1,
    max: 10,
  },
  failuresToEject: {
    kind: "integer",
    label: "Failures to eject",
    description:
      "Refused or failed requests in a row that take a target out of rotation. 0 turns passive health checks off.",
    default: 5,
    min: 0,
    max: 100,
  },
  ejectionSeconds: {
    kind: "number",
    label: "Ejection time",
    description: "How long an ejected target stays out of rotation before it gets traffic again.",
    unit: "s",
    default: 10,
    min: 1,
    max: 600,
  },
} as const satisfies ConfigFields;

export type LoadBalancerConfig = ConfigOf<typeof loadBalancerConfigFields>;

export const loadBalancerConnectionFields = {
  weight: {
    kind: "integer",
    label: "Weight",
    description:
      "This target's share of traffic relative to the other targets. Give a target with 3× the capacity 3× the weight.",
    default: 1,
    min: 1,
    max: 1_000,
  },
} as const satisfies ConfigFields;

const ALGORITHM_SUMMARY: Readonly<Record<LoadBalancerConfig["algorithm"], string>> = {
  "round-robin": "round robin",
  "least-connections": "least connections",
  "least-time": "least time",
};

export const loadBalancerDefinition: ComponentDefinition<typeof loadBalancerConfigFields> = {
  type: "load-balancer",
  label: "Load balancer",
  description: "Spreads incoming requests across the targets behind it, skipping ones that keep failing.",
  category: "traffic",
  configFields: loadBalancerConfigFields,
  summarise(config) {
    return `${ALGORITHM_SUMMARY[config.algorithm]} · ${formatCompactNumber(config.maxConnections)} conns`;
  },
  ports: [
    {
      id: "in",
      direction: "in",
      protocol: "sync-request",
      description: "Requests to spread.",
    },
    {
      id: "out",
      direction: "out",
      protocol: "sync-request",
      description: "Targets that share the requests. Each request goes to one; set each connection's weight.",
      connectionFields: loadBalancerConnectionFields,
    },
  ],
  metrics: [
    {
      id: CAPACITY_METRIC_IDS.utilisation,
      kind: "gauge",
      unit: "ratio",
      definition: "Open connections ÷ max connections. 1 means new requests are rejected.",
    },
    {
      id: "connections.open",
      kind: "gauge",
      unit: "requests",
      definition: "Requests received and not yet answered.",
    },
    {
      id: "requests.forwarded",
      kind: "counter",
      unit: "requests",
      definition: "Requests sent to a target, retries included.",
    },
    {
      id: "requests.retried",
      kind: "counter",
      unit: "requests",
      definition: "Requests sent to another target after one refused them.",
    },
    {
      id: "requests.rejected",
      kind: "counter",
      unit: "requests",
      definition: "Requests refused because every connection was in use or no target was connected.",
    },
    {
      id: "targets.ejected",
      kind: "gauge",
      unit: "targets",
      definition: "Targets out of rotation after failing too many requests in a row.",
    },
    {
      id: "targets.ejections",
      kind: "counter",
      unit: "ejections",
      definition: "Times a target was taken out of rotation.",
    },
  ],
  notModeled: [
    "Active health checks: targets are judged only by the requests they answer.",
    "Slow start: a target coming back gets its full share at once.",
    "Sticky sessions and hash-based routing (IP hash, consistent hashing).",
    "Upstream timeouts: the load balancer waits as long as the target takes.",
    "Several load balancer nodes, each seeing part of the load.",
    "TLS termination and other per-request CPU cost beyond the added latency.",
    "Connection reuse: one connection is one request in flight.",
  ],
};
