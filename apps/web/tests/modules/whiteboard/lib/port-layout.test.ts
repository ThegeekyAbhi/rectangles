import { describe, expect, it } from "vitest";
import { NODE_HEIGHT, NODE_WIDTH } from "@/modules/whiteboard/lib/component-visuals";
import { portAnchor, portOffset } from "@/modules/whiteboard/lib/port-layout";
import type { PlacedComponent } from "@/modules/whiteboard/lib/port-layout";

function node(componentType: string, x: number, y: number): PlacedComponent {
  return { componentType, position: { x, y } };
}

describe("portOffset", () => {
  it("centres a single port", () => {
    expect(portOffset(0, 1)).toBe(0.5);
  });

  it("spreads several ports evenly", () => {
    expect([0, 1, 2].map((index) => portOffset(index, 3))).toEqual([0.25, 0.5, 0.75]);
  });
});

describe("portAnchor", () => {
  it("puts an out port on the node's right side", () => {
    expect(portAnchor(node("client", 100, 200), "out")).toEqual({
      x: 100 + NODE_WIDTH,
      y: 200 + NODE_HEIGHT / 2,
    });
  });

  it("puts an in port on the node's left side", () => {
    expect(portAnchor(node("api-server", 100, 200), "in")).toEqual({
      x: 100,
      y: 200 + NODE_HEIGHT / 2,
    });
  });

  it("returns nothing for a port the component does not have", () => {
    expect(portAnchor(node("client", 0, 0), "in")).toBeUndefined();
    expect(portAnchor(node("unknown", 0, 0), "out")).toBeUndefined();
  });
});
