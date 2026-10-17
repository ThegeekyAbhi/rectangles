import { z } from "zod";

/**
 * Version of the saved document shape. Raise it whenever the shape changes, and teach
 * `migrateToCurrent` to bring the previous version forward.
 *
 * 2: edges carry `config`, the settings their source port declares (for example a weight).
 * 3: an API server is one server. `instances × concurrency` slots holding a request for
 *    `serviceTimeMs` became `workers` with `cpuTimeMs` on a sized CPU and `otherWaitMs`.
 */
export const CURRENT_SCHEMA_VERSION = 3;

const portReferenceSchema = z.strictObject({
  node: z.string().min(1),
  port: z.string().min(1),
});

const configSchema = z.record(z.string(), z.union([z.number(), z.string()]));

const documentNodeSchema = z.strictObject({
  id: z.string().min(1),
  type: z.string().min(1),
  label: z.string(),
  position: z.strictObject({ x: z.number(), y: z.number() }),
  config: configSchema,
});

const documentEdgeSchema = z.strictObject({
  id: z.string().min(1),
  from: portReferenceSchema,
  to: portReferenceSchema,
  config: configSchema,
});

/** One whiteboard: the architecture a user has drawn. */
export const projectDocumentSchema = z.strictObject({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  nodes: z.array(documentNodeSchema),
  edges: z.array(documentEdgeSchema),
});

export type PortReference = z.infer<typeof portReferenceSchema>;
export type DocumentNode = z.infer<typeof documentNodeSchema>;
export type DocumentEdge = z.infer<typeof documentEdgeSchema>;
export type ProjectDocument = z.infer<typeof projectDocumentSchema>;

export type ProjectDocumentParse =
  | { readonly ok: true; readonly document: ProjectDocument }
  | { readonly ok: false; readonly message: string };

export function createEmptyDocument(): ProjectDocument {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, nodes: [], edges: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Version 1 → 2: every edge gains empty settings. */
function addEdgeSettings(document: Record<string, unknown>): Record<string, unknown> {
  const { edges } = document;
  return Array.isArray(edges)
    ? { ...document, edges: edges.map((edge: unknown) => (isRecord(edge) ? { ...edge, config: {} } : edge)) }
    : document;
}

/** The API server's settings and their defaults as version 2 saved them. */
const VERSION_2_API_SERVER_DEFAULTS = { instances: 2, concurrency: 50, serviceTimeMs: 20, serviceTimeDistribution: "exponential" };
const MAX_WORKERS = 1_000_000;

function valueOr(value: unknown, fallback: number | string): unknown {
  return value === undefined ? fallback : value;
}

/** Instances × concurrency, or whichever of the two is not a number, for validation to report. */
function workersFrom(instances: unknown, concurrency: unknown): unknown {
  if (typeof instances !== "number") {
    return instances;
  }
  if (typeof concurrency !== "number") {
    return concurrency;
  }
  return Math.min(MAX_WORKERS, instances * concurrency);
}

/**
 * Version 2 → 3 for one API server. Its slots become workers and its service time becomes
 * time waiting with no CPU, so an old board runs exactly as it did; the user can then add
 * CPU time. A value that was not a number is carried over for validation to report.
 */
function apiServerAsOneServer(config: Record<string, unknown>): Record<string, unknown> {
  const { instances, concurrency, serviceTimeMs, serviceTimeDistribution, ...rest } = config;
  return {
    ...rest,
    size: "medium",
    workers: workersFrom(
      valueOr(instances, VERSION_2_API_SERVER_DEFAULTS.instances),
      valueOr(concurrency, VERSION_2_API_SERVER_DEFAULTS.concurrency),
    ),
    cpuTimeMs: 0,
    otherWaitMs: valueOr(serviceTimeMs, VERSION_2_API_SERVER_DEFAULTS.serviceTimeMs),
    timeDistribution: valueOr(serviceTimeDistribution, VERSION_2_API_SERVER_DEFAULTS.serviceTimeDistribution),
  };
}

const LEGACY_API_SERVER_SETTINGS = ["instances", "concurrency", "serviceTimeMs", "serviceTimeDistribution"];

/** Rewrites the API servers `isAffected` picks, leaving every other node as it is. */
function rewriteApiServers(
  document: Record<string, unknown>,
  isAffected: (config: Record<string, unknown>) => boolean,
): Record<string, unknown> {
  const { nodes } = document;
  return Array.isArray(nodes)
    ? {
        ...document,
        nodes: nodes.map((node: unknown) =>
          isRecord(node) && node.type === "api-server" && isRecord(node.config) && isAffected(node.config)
            ? { ...node, config: apiServerAsOneServer(node.config) }
            : node,
        ),
      }
    : document;
}

/** Version 2 → 3: API servers move from slots to one sized server. Left-out settings meant version 2's defaults. */
function apiServersAsOneServer(document: Record<string, unknown>): Record<string, unknown> {
  return rewriteApiServers(document, () => true);
}

/**
 * Repairs an API server that kept version 2 settings in a newer document, as a board open
 * across the upgrade can save. The old settings are what the user chose, so they win over
 * any defaults filled in beside them.
 */
function withoutLegacyApiServerSettings(document: Record<string, unknown>): Record<string, unknown> {
  return rewriteApiServers(document, (config) => LEGACY_API_SERVER_SETTINGS.some((name) => name in config));
}

/** Each step brings a document from the version at its index + 1 to the next. */
const MIGRATIONS = [addEdgeSettings, apiServersAsOneServer];

/**
 * Brings a document saved by an older version up to the current shape, one version at a
 * time. Anything it does not recognise is passed through untouched, for the schema to report.
 */
function migrateToCurrent(value: unknown): unknown {
  if (!isRecord(value) || typeof value.schemaVersion !== "number" || value.schemaVersion < 1) {
    return value;
  }
  let document: Record<string, unknown> = value;
  for (let version = value.schemaVersion; version < CURRENT_SCHEMA_VERSION; version++) {
    const migrate = MIGRATIONS[version - 1];
    if (migrate === undefined) {
      return value;
    }
    document = { ...migrate(document), schemaVersion: version + 1 };
  }
  return withoutLegacyApiServerSettings(document);
}

/**
 * Checks that a stored or imported value is a document this version can open, bringing
 * one saved by an older version up to date.
 * A document from a newer version is refused with its own message, never guessed at.
 */
export function parseProjectDocument(value: unknown): ProjectDocumentParse {
  const version =
    typeof value === "object" && value !== null && "schemaVersion" in value
      ? value.schemaVersion
      : undefined;
  if (typeof version === "number" && version > CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      message: `This project was saved by a newer version of Rectangles (format ${String(version)}; this version reads up to ${String(CURRENT_SCHEMA_VERSION)}).`,
    };
  }
  const result = projectDocumentSchema.safeParse(migrateToCurrent(value));
  if (!result.success) {
    return { ok: false, message: `This project's data is damaged: ${z.prettifyError(result.error)}` };
  }
  return { ok: true, document: result.data };
}
