import { z } from "zod";

/**
 * Version of the saved document shape. Raise it whenever the shape changes, and teach
 * `migrateToCurrent` to bring the previous version forward.
 *
 * 2: edges carry `config`, the settings their source port declares (for example a weight).
 */
export const CURRENT_SCHEMA_VERSION = 2;

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

/**
 * Brings a document saved by an older version up to the current shape. Anything it does
 * not recognise is passed through untouched, for the schema to report.
 */
function migrateToCurrent(value: unknown): unknown {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.edges)) {
    return value;
  }
  return {
    ...value,
    schemaVersion: 2,
    edges: value.edges.map((edge: unknown) => (isRecord(edge) ? { ...edge, config: {} } : edge)),
  };
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
