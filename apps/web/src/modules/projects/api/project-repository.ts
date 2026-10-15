import type { ProjectDocument } from "@rectangles/schema";
import { createEmptyDocument, parseProjectDocument } from "@rectangles/schema";
import type { StoredDocument } from "../lib/local-database";
import { openLocalDatabase } from "../lib/local-database";
import { copyName, uniqueName } from "@/lib/unique-name";
import type { LoadedProject, ProjectSummary } from "../types";

const DEFAULT_PROJECT_NAME = "Untitled project";
export const MAX_PROJECT_NAME_LENGTH = 80;

/** Trims a name and falls back to the default when nothing is left. */
function cleanName(name: string): string {
  return name.trim().slice(0, MAX_PROJECT_NAME_LENGTH) || DEFAULT_PROJECT_NAME;
}

async function listAllProjects(): Promise<ProjectSummary[]> {
  const database = await openLocalDatabase();
  return database.getAll("projects");
}

/** Projects that have not been deleted, most recently edited first. */
export async function listProjects(): Promise<ProjectSummary[]> {
  const projects = await listAllProjects();
  return projects
    .filter((project) => project.deletedAt === null)
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

async function activeNames(): Promise<string[]> {
  return (await listProjects()).map((project) => project.name);
}

/** Stores a new project, under a fresh id, with the given board as it is stored. */
async function insertProject(name: string, document: StoredDocument["document"]): Promise<ProjectSummary> {
  const database = await openLocalDatabase();
  const now = Date.now();
  const project: ProjectSummary = {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    revision: 0,
    deletedAt: null,
  };
  const transaction = database.transaction(["projects", "documents"], "readwrite");
  await Promise.all([
    transaction.objectStore("projects").put(project),
    transaction.objectStore("documents").put({ projectId: project.id, document }),
    transaction.done,
  ]);
  return project;
}

export function createProject(): Promise<ProjectSummary> {
  return createProjectFromDocument(DEFAULT_PROJECT_NAME, createEmptyDocument());
}

/**
 * Stores a new project holding a copy of the given board, under a name not yet taken.
 * Used to open a lesson's diagram as a board of its own.
 */
export async function createProjectFromDocument(name: string, document: unknown): Promise<ProjectSummary> {
  const parsed = parseProjectDocument(document);
  if (!parsed.ok) {
    throw new Error(parsed.message);
  }
  return insertProject(uniqueName(cleanName(name), await activeNames()), parsed.document);
}

async function updateProject(
  projectId: string,
  change: (project: ProjectSummary) => ProjectSummary,
): Promise<ProjectSummary> {
  const database = await openLocalDatabase();
  const transaction = database.transaction("projects", "readwrite");
  const project = await transaction.store.get(projectId);
  if (project === undefined) {
    throw new Error("This project no longer exists.");
  }
  const updated = change(project);
  await Promise.all([transaction.store.put(updated), transaction.done]);
  return updated;
}

export function renameProject(projectId: string, name: string): Promise<ProjectSummary> {
  return updateProject(projectId, (project) => ({
    ...project,
    name: cleanName(name),
    updatedAt: Date.now(),
  }));
}

/** Copies a project and its board under a new id and a "copy" name. */
export async function duplicateProject(projectId: string): Promise<ProjectSummary> {
  const database = await openLocalDatabase();
  const [original, stored, names] = await Promise.all([
    database.get("projects", projectId),
    database.get("documents", projectId),
    activeNames(),
  ]);
  if (original === undefined) {
    throw new Error("This project no longer exists.");
  }
  return insertProject(
    copyName(original.name, names),
    structuredClone(stored?.document ?? createEmptyDocument()),
  );
}

/** Hides a project. It stays restorable until `purgeProject` removes it for good. */
export function deleteProject(projectId: string): Promise<ProjectSummary> {
  return updateProject(projectId, (project) => ({ ...project, deletedAt: Date.now() }));
}

export function restoreProject(projectId: string): Promise<ProjectSummary> {
  return updateProject(projectId, (project) => ({ ...project, deletedAt: null }));
}

/** Permanently removes a deleted project and its board. */
export async function purgeProject(projectId: string): Promise<void> {
  const database = await openLocalDatabase();
  const transaction = database.transaction(["projects", "documents"], "readwrite");
  const project = await transaction.objectStore("projects").get(projectId);
  if (project?.deletedAt != null) {
    await Promise.all([
      transaction.objectStore("projects").delete(projectId),
      transaction.objectStore("documents").delete(projectId),
    ]);
  }
  await transaction.done;
}

/**
 * Removes every project deleted in an earlier session, whose Undo can no longer be
 * reached. Call once when the app starts.
 */
export async function purgeDeletedProjects(): Promise<void> {
  const deleted = (await listAllProjects()).filter((project) => project.deletedAt !== null);
  await Promise.all(deleted.map((project) => purgeProject(project.id)));
}

export async function loadProject(projectId: string): Promise<LoadedProject> {
  const database = await openLocalDatabase();
  const [project, stored] = await Promise.all([
    database.get("projects", projectId),
    database.get("documents", projectId),
  ]);
  if (project?.deletedAt !== null) {
    return { status: "not-found" };
  }
  const parsed = parseProjectDocument(stored?.document);
  return parsed.ok
    ? { status: "ready", project, document: parsed.document }
    : { status: "damaged", project, message: parsed.message };
}

/** Saves a board and raises the project's revision. */
export async function saveProjectDocument(
  projectId: string,
  document: ProjectDocument,
): Promise<ProjectSummary> {
  const database = await openLocalDatabase();
  const transaction = database.transaction(["projects", "documents"], "readwrite");
  const project = await transaction.objectStore("projects").get(projectId);
  if (project === undefined) {
    throw new Error("This project no longer exists.");
  }
  const updated: ProjectSummary = {
    ...project,
    updatedAt: Date.now(),
    revision: project.revision + 1,
  };
  await Promise.all([
    transaction.objectStore("projects").put(updated),
    transaction.objectStore("documents").put({ projectId, document }),
    transaction.done,
  ]);
  return updated;
}
