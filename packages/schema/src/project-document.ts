import { z } from "zod";

/** Version of the saved document shape. Raise it whenever the shape changes. */
export const CURRENT_SCHEMA_VERSION = 1;

const portReferenceSchema = z.strictObject({
  node: z.string().min(1),
  port: z.string().min(1),
});

const documentNodeSchema = z.strictObject({
  id: z.string().min(1),
  type: z.string().min(1),
  label: z.string(),
  position: z.strictObject({ x: z.number(), y: z.number() }),
  config: z.record(z.string(), z.union([z.number(), z.string()])),
});

const documentEdgeSchema = z.strictObject({
  id: z.string().min(1),
  from: portReferenceSchema,
  to: portReferenceSchema,
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

/**
 * Checks that a stored or imported value is a document this version can open.
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
  const result = projectDocumentSchema.safeParse(value);
  if (!result.success) {
    return { ok: false, message: `This project's data is damaged: ${z.prettifyError(result.error)}` };
  }
  return { ok: true, document: result.data };
}
