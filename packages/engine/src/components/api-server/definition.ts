import { formatCompactNumber } from "../../contract/compact-number.ts";
import type { ComponentDefinition } from "../../contract/component-definition.ts";
import type { ConfigFields, ConfigOf } from "../../contract/config-field.ts";
import { CAPACITY_METRIC_IDS } from "../../contract/metric.ts";

export const apiServerConfigFields = {
  instances: {
    kind: "integer",
    label: "Instances",
    description: "Number of identical servers. More instances raise capacity.",
    default: 2,
    min: 1,
    max: 1_000,
  },
  concurrency: {
    kind: "integer",
    label: "Concurrency per instance",
    description: "Requests one instance works on at the same time.",
    default: 50,
    min: 1,
    max: 10_000,
  },
  serviceTimeMs: {
    kind: "number",
    label: "Service time",
    description: "Average time to handle one request, not counting time spent waiting in the queue.",
    unit: "ms",
    default: 20,
    min: 0.001,
    max: 600_000,
  },
  serviceTimeDistribution: {
    kind: "choice",
    label: "Service time spread",
    description: "Exponential varies around the average like real workloads; constant is always exactly the average.",
    options: ["exponential", "constant"],
    default: "exponential",
  },
  queueLimit: {
    kind: "integer",
    label: "Queue limit",
    description: "Requests allowed to wait when every slot is busy. Further requests are rejected.",
    default: 100,
    min: 0,
    max: 1_000_000,
  },
} as const satisfies ConfigFields;

export type ApiServerConfig = ConfigOf<typeof apiServerConfigFields>;

export const apiServerDefinition: ComponentDefinition<typeof apiServerConfigFields> = {
  type: "api-server",
  label: "API server",
  description: "Handles requests with a fixed number of slots and a bounded waiting queue.",
  configFields: apiServerConfigFields,
  summarise(config) {
    const slots = `${formatCompactNumber(config.instances)} × ${formatCompactNumber(config.concurrency)} slots`;
    // A second or more reads better in seconds: `2 s`, not `2K ms`.
    const serviceTime =
      config.serviceTimeMs >= 1_000
        ? `${formatCompactNumber(config.serviceTimeMs / 1_000)} s`
        : `${formatCompactNumber(config.serviceTimeMs)} ms`;
    return `${slots} · ${serviceTime}`;
  },
  ports: [
    {
      id: "in",
      direction: "in",
      protocol: "sync-request",
      description: "Requests to handle.",
    },
  ],
  metrics: [
    {
      id: CAPACITY_METRIC_IDS.utilisation,
      kind: "gauge",
      unit: "ratio",
      definition: "Busy slots ÷ total slots (instances × concurrency). 1 means fully busy.",
    },
    {
      id: CAPACITY_METRIC_IDS.queueDepth,
      kind: "gauge",
      unit: "requests",
      definition: "Requests waiting for a free slot.",
    },
    {
      id: "queue.wait",
      kind: "sample",
      unit: "ms",
      definition: "Time a request waited for a slot before work on it began. 0 if a slot was free.",
    },
    {
      id: "requests.completed",
      kind: "counter",
      unit: "requests",
      definition: "Requests the server finished handling.",
    },
    {
      id: "requests.rejected",
      kind: "counter",
      unit: "requests",
      definition: "Requests refused because the queue was full.",
    },
  ],
  notModeled: [
    "CPU, memory and garbage-collection pauses.",
    "Slower service as load rises: service time does not depend on how busy the server is.",
    "Uneven load between instances: all instances share one queue.",
    "Autoscaling, cold starts and deployments.",
    "Cancelling work after the caller has timed out.",
  ],
};
