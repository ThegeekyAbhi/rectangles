import type { DBSchema, IDBPDatabase } from "idb";
import { openDB } from "idb";
import type { ProjectSummary } from "../types";

const DATABASE_NAME = "rectangles";
const DATABASE_VERSION = 1;

export interface StoredDocument {
  readonly projectId: string;
  /** Kept as stored and checked on load, so a damaged record can be reported. */
  readonly document: unknown;
}

interface RectanglesDatabase extends DBSchema {
  projects: { key: string; value: ProjectSummary };
  documents: { key: string; value: StoredDocument };
}

export type LocalDatabase = IDBPDatabase<RectanglesDatabase>;

let databasePromise: Promise<LocalDatabase> | null = null;

/**
 * Opens the browser database, creating it on first use. Summaries and documents are
 * separate stores so that listing projects never loads a whole board.
 */
export function openLocalDatabase(): Promise<LocalDatabase> {
  databasePromise ??= openDB<RectanglesDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database) {
      database.createObjectStore("projects", { keyPath: "id" });
      database.createObjectStore("documents", { keyPath: "projectId" });
    },
  });
  return databasePromise;
}
