import { describe, expect, it } from "vitest";
import {
  PASTE_OFFSET,
  pickCopiedElements,
  placePastedElements,
} from "@/modules/whiteboard/lib/paste-placement";
import type { ComponentNode, ConnectionEdge } from "@/modules/whiteboard/types";

function node(id: string, x: number, isSelected: boolean): ComponentNode {
  return {
    id,
    type: "component",
    position: { x, y: 0 },
    data: { componentType: "api-server", label: id, config: {} },
    selected: isSelected,
  };
}

function edge(id: string, source: string, target: string): ConnectionEdge {
  return { id, source, sourceHandle: "out", target, targetHandle: "in" };
}

const nodes = [node("a", 0, true), node("b", 300, true), node("c", 600, false)];
const edges = [edge("a-b", "a", "b"), edge("b-c", "b", "c")];

function createIds(): () => string {
  let next = 0;
  return () => `new-${++next}`;
}

describe("pickCopiedElements", () => {
  it("keeps selected nodes and only the edges between them", () => {
    const copied = pickCopiedElements(nodes, edges);
    expect(copied.nodes.map((copiedNode) => copiedNode.id)).toEqual(["a", "b"]);
    expect(copied.edges.map((copiedEdge) => copiedEdge.id)).toEqual(["a-b"]);
  });
});

describe("placePastedElements", () => {
  const copied = pickCopiedElements(nodes, edges);

  it("gives every pasted element a new id and rewires edges to the new nodes", () => {
    const pasted = placePastedElements(copied, 1, createIds());
    expect(pasted.nodes.map((pastedNode) => pastedNode.id)).toEqual(["new-1", "new-2"]);
    expect(pasted.edges).toMatchObject([{ id: "new-3", source: "new-1", target: "new-2" }]);
  });

  it("offsets each paste further than the one before", () => {
    const first = placePastedElements(copied, 1, createIds());
    const second = placePastedElements(copied, 2, createIds());
    expect(first.nodes[0]?.position).toEqual({ x: PASTE_OFFSET, y: PASTE_OFFSET });
    expect(second.nodes[1]?.position).toEqual({ x: 300 + 2 * PASTE_OFFSET, y: 2 * PASTE_OFFSET });
  });

  it("selects the pasted nodes and keeps their settings", () => {
    const pasted = placePastedElements(copied, 1, createIds());
    expect(pasted.nodes.every((pastedNode) => pastedNode.selected)).toBe(true);
    expect(pasted.nodes[0]?.data).toBe(copied.nodes[0]?.data);
  });
});
