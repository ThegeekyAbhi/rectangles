import { formatCompactNumber } from "../../contract/compact-number.ts";
import type { ComponentDefinition } from "../../contract/component-definition.ts";
import type { ConfigFields, ConfigOf } from "../../contract/config-field.ts";
import { CAPACITY_METRIC_IDS } from "../../contract/metric.ts";

/** vCPU of each server size, the same steps cloud instance families use. */
export const CORES_BY_SIZE = { small: 2, medium: 4, large: 8, xlarge: 16 } as const;

const SCALE_UP = "Scale up";
const WORKLOAD = "Workload";
const LIMITS = "Limits";

export const apiServerConfigFields = {
  size: {
    kind: "choice",
    label: "Size",
    description: "How big this one server is. A bigger server has more CPU cores, which helps when requests spend their time computing.",
    section: SCALE_UP,
    options: ["small", "medium", "large", "xlarge"],
    optionDescriptions: {
      small: "2 vCPU. Fine for light traffic or I/O-bound work.",
      medium: "4 vCPU. A typical general-purpose server.",
      large: "8 vCPU. Twice medium: doubles throughput when the CPU is the limit, and changes nothing when waiting is.",
      xlarge: "16 vCPU. For CPU-heavy work; past this, more servers usually beat a bigger one.",
    },
    default: "medium",
  },
  workers: {
    kind: "integer",
    label: "Workers",
    description:
      "Requests this server handles at once: its thread pool or event-loop concurrency. Each request holds a worker from start to finish, including while it waits.",
    section: SCALE_UP,
    default: 50,
    min: 1,
    max: 1_000_000,
  },
  cpuTimeMs: {
    kind: "number",
    label: "CPU time",
    description: "Average time one request spends computing on a core. Requests queue for a core when every core is busy.",
    section: WORKLOAD,
    unit: "ms",
    default: 2,
    min: 0,
    max: 600_000,
  },
  otherWaitMs: {
    kind: "number",
    label: "Other wait",
    description:
      "Average time one request spends waiting on things not drawn on the board, such as disk or another service. It holds a worker but no core.",
    section: WORKLOAD,
    unit: "ms",
    default: 18,
    min: 0,
    max: 600_000,
  },
  timeDistribution: {
    kind: "choice",
    label: "Time spread",
    description: "Exponential varies around the averages like real workloads; constant is always exactly the averages.",
    section: WORKLOAD,
    options: ["exponential", "constant"],
    default: "exponential",
  },
  queueLimit: {
    kind: "integer",
    label: "Queue limit",
    description: "Requests allowed to wait when every worker is busy. Further requests are refused.",
    section: LIMITS,
    default: 100,
    min: 0,
    max: 1_000_000,
  },
} as const satisfies ConfigFields;

export type ApiServerConfig = ConfigOf<typeof apiServerConfigFields>;

/** Settings on each connection from an API server to a database. */
export const apiServerDatabaseConnectionFields = {
  queriesPerRequest: {
    kind: "integer",
    label: "Queries per request",
    description:
      "Queries one request runs against this database, one after another. Fetching a list, then each item, is the N+1 pattern.",
    default: 1,
    min: 1,
    max: 100,
  },
} as const satisfies ConfigFields;

export const apiServerDefinition: ComponentDefinition<typeof apiServerConfigFields> = {
  type: "api-server",
  label: "API server",
  description:
    "One server. Each request takes a worker, computes on a CPU core, waits on anything off the board, then queries its databases.",
  category: "compute",
  configFields: apiServerConfigFields,
  summarise(config) {
    const cores = `${CORES_BY_SIZE[config.size]} vCPU`;
    const workers = `${formatCompactNumber(config.workers)} workers`;
    const totalMs = config.cpuTimeMs + config.otherWaitMs;
    // A second or more reads better in seconds: `2 s`, not `2K ms`.
    const time = totalMs >= 1_000 ? `${formatCompactNumber(totalMs / 1_000)} s` : `${formatCompactNumber(totalMs)} ms`;
    return `${cores} · ${workers} · ${time}`;
  },
  scaleOut: { via: "load-balancer", port: "out", afterSection: SCALE_UP },
  ports: [
    {
      id: "in",
      direction: "in",
      protocol: "sync-request",
      description: "Requests to handle.",
    },
    {
      id: "database",
      direction: "out",
      protocol: "database-query",
      description:
        "Queries made while handling a request, after its CPU time and other wait. The worker stays busy until every query is answered.",
      connectionFields: apiServerDatabaseConnectionFields,
    },
  ],
  metrics: [
    {
      id: CAPACITY_METRIC_IDS.utilisation,
      kind: "gauge",
      unit: "ratio",
      definition: "Busy workers ÷ workers. 1 means every worker is busy.",
    },
    {
      id: CAPACITY_METRIC_IDS.queueDepth,
      kind: "gauge",
      unit: "requests",
      definition: "Requests waiting for a free worker.",
    },
    {
      id: "queue.wait",
      kind: "sample",
      unit: "ms",
      definition: "Time a request waited for a worker before work on it began. 0 if one was free.",
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
    {
      id: "requests.failed",
      kind: "counter",
      unit: "requests",
      definition: "Requests that failed because a database refused or failed one of their queries.",
    },
    {
      id: "database.wait",
      kind: "sample",
      unit: "ms",
      definition: "Time a request spent waiting on its database queries while holding its worker.",
    },
    {
      id: "cpu.utilisation",
      kind: "gauge",
      unit: "ratio",
      definition: "Busy cores ÷ vCPU. Near 1 with workers to spare means the CPU is the limit: a bigger size helps.",
    },
    {
      id: "cpu.queue-depth",
      kind: "gauge",
      unit: "requests",
      definition: "Requests holding a worker while they wait for a free core.",
    },
  ],
  notModeled: [
    "Memory and garbage-collection pauses.",
    "Cores shared by time slicing: a request holds one core for its whole CPU time, first come, first served.",
    "Slower service as load rises beyond waiting for workers and cores, such as lock contention.",
    "Autoscaling, cold starts and deployments.",
    "Cancelling work after the caller has timed out.",
    "Queries in parallel: a request's queries run one after another, all for the request's own key.",
    "A connection pool inside the server: the database's own connection limit applies.",
  ],
};
