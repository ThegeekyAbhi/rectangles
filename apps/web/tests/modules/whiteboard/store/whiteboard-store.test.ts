import { beforeEach, describe, expect, it } from "vitest";
import { clearClipboard } from "@/modules/whiteboard/lib/clipboard";
import { defaultConfigFor } from "@/modules/whiteboard/lib/component-catalog";
import type { WhiteboardStore } from "@/modules/whiteboard/store/whiteboard-store";
import { createWhiteboardStore } from "@/modules/whiteboard/store/whiteboard-store";

let store: WhiteboardStore;

const labels = () => store.getState().nodes.map((node) => node.data.label);
const positions = () => store.getState().nodes.map((node) => node.position);
const history = () => store.temporal.getState();
const undoSteps = () => history().pastStates.length;

/** Reports a drag the way the canvas does: many moves, then a drop. */
function drag(nodeId: string, path: readonly { x: number; y: number }[]): void {
  const { applyNodeChanges } = store.getState();
  for (const position of path) {
    applyNodeChanges([{ type: "position", id: nodeId, position, dragging: true }]);
  }
  const last = path[path.length - 1];
  applyNodeChanges([{ type: "position", id: nodeId, position: last, dragging: false }]);
}

function select(...nodeIds: string[]): void {
  store.getState().applyNodeChanges(
    store.getState().nodes.map((node) => ({
      type: "select" as const,
      id: node.id,
      selected: nodeIds.includes(node.id),
    })),
  );
}

beforeEach(() => {
  clearClipboard();
  store = createWhiteboardStore({ nodes: [], edges: [] });
});

describe("adding and editing nodes", () => {
  it("adds a component with its default settings and selects it", () => {
    const id = store.getState().addNode("api-server", { x: 40, y: 80 });

    expect(store.getState().nodes).toMatchObject([
      {
        id,
        type: "component",
        position: { x: 40, y: 80 },
        selected: true,
        data: { componentType: "api-server", label: "API server", config: defaultConfigFor("api-server") },
      },
    ]);
  });

  it("numbers the labels of further components of the same type", () => {
    store.getState().addNode("api-server", { x: 0, y: 0 });
    store.getState().addNode("api-server", { x: 0, y: 0 });
    store.getState().addNode("client", { x: 0, y: 0 });
    expect(labels()).toEqual(["API server", "API server 2", "Client"]);
  });

  it("deselects everything else when a component is added", () => {
    store.getState().addNode("client", { x: 0, y: 0 });
    store.getState().addNode("api-server", { x: 0, y: 0 });
    expect(store.getState().nodes.map((node) => node.selected)).toEqual([false, true]);
  });

  it("renames a node and replaces its config", () => {
    const id = store.getState().addNode("api-server", { x: 0, y: 0 });
    store.getState().renameNode(id, "Checkout API");
    store.getState().setNodeConfig(id, { ...defaultConfigFor("api-server"), instances: 6 });

    expect(store.getState().nodes[0]?.data).toMatchObject({
      label: "Checkout API",
      config: { instances: 6, concurrency: 50 },
    });
  });
});

describe("connecting", () => {
  it("adds an edge between an out port and an in port", () => {
    const client = store.getState().addNode("client", { x: 0, y: 0 });
    const api = store.getState().addNode("api-server", { x: 300, y: 0 });
    store.getState().connect({ source: client, sourceHandle: "out", target: api, targetHandle: "in" });

    expect(store.getState().edges).toMatchObject([
      { source: client, sourceHandle: "out", target: api, targetHandle: "in", type: "connection" },
    ]);
  });

  it("ignores a malformed or repeated connection", () => {
    const client = store.getState().addNode("client", { x: 0, y: 0 });
    const api = store.getState().addNode("api-server", { x: 300, y: 0 });
    const connection = { source: client, sourceHandle: "out", target: api, targetHandle: "in" };
    store.getState().connect(connection);
    store.getState().connect(connection);
    store.getState().connect({ source: api, sourceHandle: "in", target: client, targetHandle: "out" });

    expect(store.getState().edges).toHaveLength(1);
  });
});

describe("deleting", () => {
  it("removes a node together with the edges attached to it", () => {
    const client = store.getState().addNode("client", { x: 0, y: 0 });
    const api = store.getState().addNode("api-server", { x: 300, y: 0 });
    store.getState().connect({ source: client, sourceHandle: "out", target: api, targetHandle: "in" });

    store.getState().deleteElements([api], []);

    expect(labels()).toEqual(["Client"]);
    expect(store.getState().edges).toEqual([]);
  });

  it("deletes the selection", () => {
    const client = store.getState().addNode("client", { x: 0, y: 0 });
    store.getState().addNode("api-server", { x: 300, y: 0 });
    select(client);
    store.getState().deleteSelection();
    expect(labels()).toEqual(["API server"]);
  });
});

describe("copy, paste and duplicate", () => {
  it("pastes copies of the selected nodes with the edges between them", () => {
    const client = store.getState().addNode("client", { x: 0, y: 0 });
    const api = store.getState().addNode("api-server", { x: 300, y: 0 });
    store.getState().connect({ source: client, sourceHandle: "out", target: api, targetHandle: "in" });
    select(client, api);

    expect(store.getState().copySelection()).toBe(2);
    store.getState().pasteClipboard();

    expect(labels()).toEqual(["Client", "API server", "Client 2", "API server 2"]);
    expect(store.getState().edges).toHaveLength(2);
    expect(store.getState().nodes.map((node) => node.selected)).toEqual([false, false, true, true]);
  });

  it("offsets each successive paste", () => {
    const client = store.getState().addNode("client", { x: 0, y: 0 });
    select(client);
    store.getState().copySelection();
    store.getState().pasteClipboard();
    store.getState().pasteClipboard();
    expect(positions()).toEqual([{ x: 0, y: 0 }, { x: 32, y: 32 }, { x: 64, y: 64 }]);
  });

  it("pastes onto a different board", () => {
    const client = store.getState().addNode("client", { x: 0, y: 0 });
    select(client);
    store.getState().copySelection();

    const otherBoard = createWhiteboardStore({ nodes: [], edges: [] });
    otherBoard.getState().pasteClipboard();
    expect(otherBoard.getState().nodes).toMatchObject([{ data: { label: "Client" } }]);
  });

  it("does nothing when pasting with an empty clipboard", () => {
    store.getState().pasteClipboard();
    expect(store.getState().nodes).toEqual([]);
    expect(undoSteps()).toBe(0);
  });

  it("duplicates the selection without touching the clipboard", () => {
    const client = store.getState().addNode("client", { x: 0, y: 0 });
    select(client);
    store.getState().duplicateSelection();
    store.getState().pasteClipboard();
    expect(labels()).toEqual(["Client", "Client 2"]);
  });
});

describe("undo and redo", () => {
  it("undoes and redoes an edit", () => {
    store.getState().addNode("client", { x: 0, y: 0 });
    history().undo();
    expect(labels()).toEqual([]);
    history().redo();
    expect(labels()).toEqual(["Client"]);
  });

  it("undoes a whole drag in one step", () => {
    const id = store.getState().addNode("client", { x: 0, y: 0 });
    const stepsBefore = undoSteps();

    drag(id, [{ x: 10, y: 5 }, { x: 60, y: 30 }, { x: 160, y: 96 }]);
    expect(positions()).toEqual([{ x: 160, y: 96 }]);
    expect(undoSteps()).toBe(stepsBefore + 1);

    history().undo();
    expect(positions()).toEqual([{ x: 0, y: 0 }]);
    history().redo();
    expect(positions()).toEqual([{ x: 160, y: 96 }]);
  });

  it("records edits made after a drag as their own steps", () => {
    const id = store.getState().addNode("client", { x: 0, y: 0 });
    drag(id, [{ x: 50, y: 50 }]);
    const stepsAfterDrag = undoSteps();

    store.getState().renameNode(id, "Users");
    expect(undoSteps()).toBe(stepsAfterDrag + 1);

    history().undo();
    expect(store.getState().nodes[0]).toMatchObject({ position: { x: 50, y: 50 }, data: { label: "Client" } });
  });

  it("adds no step for selecting, measuring or a click that moves nothing", () => {
    const id = store.getState().addNode("client", { x: 0, y: 0 });
    const stepsBefore = undoSteps();

    select();
    select(id);
    store.getState().selectAll();
    store.getState().applyNodeChanges([{ type: "dimensions", id, dimensions: { width: 200, height: 72 } }]);
    store.getState().applyNodeChanges([{ type: "position", id, position: { x: 0, y: 0 }, dragging: false }]);

    expect(undoSteps()).toBe(stepsBefore);
  });

  it("undoes a multi-node delete, with its edges, in one step", () => {
    const client = store.getState().addNode("client", { x: 0, y: 0 });
    const api = store.getState().addNode("api-server", { x: 300, y: 0 });
    store.getState().connect({ source: client, sourceHandle: "out", target: api, targetHandle: "in" });
    const stepsBefore = undoSteps();

    store.getState().deleteElements([client, api], []);
    expect(undoSteps()).toBe(stepsBefore + 1);

    history().undo();
    expect(labels()).toEqual(["Client", "API server"]);
    expect(store.getState().edges).toHaveLength(1);
  });

  it("undoes a paste in one step", () => {
    const client = store.getState().addNode("client", { x: 0, y: 0 });
    const api = store.getState().addNode("api-server", { x: 300, y: 0 });
    store.getState().connect({ source: client, sourceHandle: "out", target: api, targetHandle: "in" });
    select(client, api);
    store.getState().copySelection();
    const stepsBefore = undoSteps();

    store.getState().pasteClipboard();
    expect(undoSteps()).toBe(stepsBefore + 1);
    history().undo();
    expect(labels()).toEqual(["Client", "API server"]);
  });

  it("drops redo history when a new edit is made", () => {
    store.getState().addNode("client", { x: 0, y: 0 });
    history().undo();
    store.getState().addNode("api-server", { x: 0, y: 0 });

    expect(history().futureStates).toEqual([]);
    history().redo();
    expect(labels()).toEqual(["API server"]);
  });

  it("adds no step when a rename changes nothing", () => {
    const id = store.getState().addNode("client", { x: 0, y: 0 });
    const stepsBefore = undoSteps();
    store.getState().renameNode(id, "Client");
    expect(undoSteps()).toBe(stepsBefore);
  });
});
