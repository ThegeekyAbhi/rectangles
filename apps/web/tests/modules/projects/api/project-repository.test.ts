import type { ProjectDocument } from "@rectangles/schema";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createProject,
  deleteProject,
  duplicateProject,
  listProjects,
  loadProject,
  purgeDeletedProjects,
  purgeProject,
  renameProject,
  restoreProject,
  saveProjectDocument,
} from "@/modules/projects/api/project-repository";
import { openLocalDatabase } from "@/modules/projects/lib/local-database";

const board: ProjectDocument = {
  schemaVersion: 1,
  nodes: [{ id: "client", type: "client", label: "Client", position: { x: 0, y: 0 }, config: {} }],
  edges: [],
};

beforeEach(async () => {
  const database = await openLocalDatabase();
  await Promise.all([database.clear("projects"), database.clear("documents")]);
});

describe("project repository", () => {
  it("creates a project with an empty board", async () => {
    const project = await createProject();

    expect(project).toMatchObject({ name: "Untitled project", revision: 0, deletedAt: null });
    expect(await loadProject(project.id)).toMatchObject({
      status: "ready",
      document: { schemaVersion: 1, nodes: [], edges: [] },
    });
  });

  it("numbers further untitled projects", async () => {
    await createProject();
    expect((await createProject()).name).toBe("Untitled project 2");
  });

  it("lists projects with the most recently edited first", async () => {
    const first = await createProject();
    const second = await createProject();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await saveProjectDocument(first.id, board);

    expect((await listProjects()).map((project) => project.id)).toEqual([first.id, second.id]);
  });

  it("renames a project, trimming the name", async () => {
    const project = await createProject();
    await renameProject(project.id, "  Checkout flow  ");
    expect((await listProjects())[0]?.name).toBe("Checkout flow");
  });

  it("falls back to the default name when renamed to nothing", async () => {
    const project = await createProject();
    expect((await renameProject(project.id, "   ")).name).toBe("Untitled project");
  });

  it("saves a board and raises the revision each time", async () => {
    const project = await createProject();
    await saveProjectDocument(project.id, board);
    const saved = await saveProjectDocument(project.id, board);

    expect(saved.revision).toBe(2);
    expect(await loadProject(project.id)).toMatchObject({ status: "ready", document: board });
  });

  it("duplicates a project with its board under a new id and a copy name", async () => {
    const original = await createProject();
    await saveProjectDocument(original.id, board);

    const copy = await duplicateProject(original.id);

    expect(copy.id).not.toBe(original.id);
    expect(copy).toMatchObject({ name: "Untitled project copy", revision: 0 });
    expect(await loadProject(copy.id)).toMatchObject({ status: "ready", document: board });
  });

  it("keeps a duplicate independent of its original", async () => {
    const original = await createProject();
    const copy = await duplicateProject(original.id);
    await saveProjectDocument(copy.id, board);

    expect(await loadProject(original.id)).toMatchObject({ document: { nodes: [] } });
  });

  it("hides a deleted project and brings it back on restore", async () => {
    const project = await createProject();
    await saveProjectDocument(project.id, board);

    await deleteProject(project.id);
    expect(await listProjects()).toEqual([]);
    expect(await loadProject(project.id)).toEqual({ status: "not-found" });

    await restoreProject(project.id);
    expect(await loadProject(project.id)).toMatchObject({ status: "ready", document: board });
  });

  it("purges only projects that are deleted", async () => {
    const kept = await createProject();
    const removed = await createProject();
    await deleteProject(removed.id);

    await purgeProject(kept.id);
    await purgeDeletedProjects();

    const database = await openLocalDatabase();
    expect(await database.getAllKeys("projects")).toEqual([kept.id]);
    expect(await database.getAllKeys("documents")).toEqual([kept.id]);
  });

  it("reports an unknown project as not found", async () => {
    expect(await loadProject("missing")).toEqual({ status: "not-found" });
  });

  it("reports a damaged board instead of opening it", async () => {
    const project = await createProject();
    const database = await openLocalDatabase();
    await database.put("documents", { projectId: project.id, document: { nodes: "broken" } });

    expect(await loadProject(project.id)).toMatchObject({
      status: "damaged",
      message: expect.stringContaining("damaged") as string,
    });
  });

  it("refuses to save a board for a project that no longer exists", async () => {
    await expect(saveProjectDocument("missing", board)).rejects.toThrow(/no longer exists/);
  });
});
