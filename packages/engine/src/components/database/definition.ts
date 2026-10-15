import { formatCompactNumber } from "../../contract/compact-number.ts";
import type { ComponentDefinition } from "../../contract/component-definition.ts";
import type { ConfigFields, ConfigOf } from "../../contract/config-field.ts";
import { CAPACITY_METRIC_IDS } from "../../contract/metric.ts";

export const databaseConfigFields = {
  maxConnections: {
    kind: "integer",
    label: "Max connections",
    description:
      "Queries the database runs at once; each holds a connection until it finishes. Postgres's max_connections, or the app's pool size.",
    default: 20,
    min: 1,
    max: 10_000,
  },
  connectionQueueLimit: {
    kind: "integer",
    label: "Connection queue limit",
    description: "Queries allowed to wait for a free connection. Further queries are rejected.",
    default: 200,
    min: 0,
    max: 1_000_000,
  },
  connectionWaitTimeoutMs: {
    kind: "number",
    label: "Connection wait timeout",
    description:
      "How long a query waits for a connection before it is rejected. HikariCP's default is 30 s, far longer than most callers wait.",
    unit: "ms",
    default: 30_000,
    min: 1,
    max: 600_000,
  },
  cpuCores: {
    kind: "integer",
    label: "CPU cores",
    description:
      "Queries actually executing at once. Connections beyond the core count only wait for a core, so they add no throughput.",
    default: 4,
    min: 1,
    max: 256,
  },
  readTimeMs: {
    kind: "number",
    label: "Read time",
    description: "Average CPU time of one read whose row is already in memory, such as an indexed lookup.",
    unit: "ms",
    default: 5,
    min: 0.001,
    max: 600_000,
  },
  writeTimeMs: {
    kind: "number",
    label: "Write time",
    description: "Average CPU time of one write, including committing it to the write-ahead log.",
    unit: "ms",
    default: 15,
    min: 0.001,
    max: 600_000,
  },
  queryTimeDistribution: {
    kind: "choice",
    label: "Query time spread",
    description: "Exponential varies around the average like real workloads; constant is always exactly the average.",
    options: ["exponential", "constant"],
    default: "exponential",
  },
  rowsInMemory: {
    kind: "integer",
    label: "Rows in memory",
    description:
      "Rows the buffer cache holds (Postgres shared_buffers, the InnoDB buffer pool). Least recently used rows are evicted; anything else is read from disk.",
    default: 100_000,
    min: 0,
    max: 10_000_000,
  },
  diskReadMs: {
    kind: "number",
    label: "Disk read time",
    description: "Time to fetch a row that is not in memory. The query keeps its connection but not a core while it waits.",
    unit: "ms",
    default: 2,
    min: 0,
    max: 10_000,
  },
  lockWaitTimeoutMs: {
    kind: "number",
    label: "Lock wait timeout",
    description:
      "How long a write waits for another write to the same row to finish before it fails. MySQL's default is 50 s.",
    unit: "ms",
    default: 50_000,
    min: 1,
    max: 600_000,
  },
} as const satisfies ConfigFields;

export type DatabaseConfig = ConfigOf<typeof databaseConfigFields>;

export const databaseDefinition: ComponentDefinition<typeof databaseConfigFields> = {
  type: "database",
  label: "Database",
  description: "Runs reads and writes with a connection pool, CPU cores, row locks and a buffer cache.",
  category: "data",
  configFields: databaseConfigFields,
  summarise(config) {
    return `${formatCompactNumber(config.maxConnections)} connections · ${formatCompactNumber(config.cpuCores)} cores`;
  },
  ports: [
    {
      id: "in",
      direction: "in",
      protocol: "database-query",
      description: "Queries to run: a read or a write of one row, chosen by the request's key.",
    },
  ],
  metrics: [
    {
      id: CAPACITY_METRIC_IDS.utilisation,
      kind: "gauge",
      unit: "ratio",
      definition: "Connections in use ÷ max connections. 1 means the pool is exhausted.",
    },
    {
      id: CAPACITY_METRIC_IDS.queueDepth,
      kind: "gauge",
      unit: "queries",
      definition: "Queries waiting for a free connection.",
    },
    {
      id: "connections.wait",
      kind: "sample",
      unit: "ms",
      definition: "Time a query waited for a connection. 0 if one was free.",
    },
    {
      id: "cpu.utilisation",
      kind: "gauge",
      unit: "ratio",
      definition: "Busy cores ÷ CPU cores. Near 1 with connections to spare means the CPU is the limit.",
    },
    {
      id: "cpu.queue-depth",
      kind: "gauge",
      unit: "queries",
      definition: "Queries holding a connection but waiting for a free core.",
    },
    {
      id: "locks.waiting",
      kind: "gauge",
      unit: "queries",
      definition: "Writes holding a connection while they wait for another write to the same row.",
    },
    {
      id: "locks.wait",
      kind: "sample",
      unit: "ms",
      definition: "Time a write waited for its row lock. 0 if the row was free.",
    },
    {
      id: "buffer-cache.hits",
      kind: "counter",
      unit: "queries",
      definition: "Queries whose row was already in memory.",
    },
    {
      id: "buffer-cache.misses",
      kind: "counter",
      unit: "queries",
      definition: "Queries that had to read their row from disk first.",
    },
    {
      id: "queries.reads",
      kind: "counter",
      unit: "queries",
      definition: "Reads completed.",
    },
    {
      id: "queries.writes",
      kind: "counter",
      unit: "queries",
      definition: "Writes completed.",
    },
    {
      id: "queries.rejected",
      kind: "counter",
      unit: "queries",
      definition: "Queries refused because the connection queue was full or the wait for a connection timed out.",
    },
    {
      id: "queries.failed",
      kind: "counter",
      unit: "queries",
      definition: "Writes that failed because they waited too long for a row lock.",
    },
    {
      id: "query.latency",
      kind: "sample",
      unit: "ms",
      definition: "Time from a query arriving to its answer, including every wait.",
    },
  ],
  notModeled: [
    "Query planning, joins, table size and missing indexes: each query touches one row at a fixed cost.",
    "Transactions and isolation levels: every query commits on its own.",
    "Deadlocks: a query locks one row, so none can form.",
    "Read locks: reads never wait for writes, as with MVCC in Postgres.",
    "Slowdown from context switching when far more connections than cores are busy.",
    "Vacuum, checkpoints and the cost of opening a connection.",
    "Replication, read replicas, sharding and failover.",
  ],
};
