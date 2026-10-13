import { describe, expect, it } from "vitest";
import { alignBox } from "@/modules/whiteboard/lib/alignment-geometry";

const anchor = { x: 100, y: 100, width: 200, height: 80 };

describe("alignBox", () => {
  it("leaves a box alone when nothing is within the threshold", () => {
    const moving = { x: 500, y: 400, width: 200, height: 80 };
    expect(alignBox(moving, [anchor], 5)).toEqual({ x: 500, y: 400, guides: [] });
  });

  it("snaps left edges together and draws a vertical guide spanning both boxes", () => {
    const moving = { x: 103, y: 300, width: 200, height: 80 };
    expect(alignBox(moving, [anchor], 5)).toEqual({
      x: 100,
      y: 300,
      guides: [{ orientation: "vertical", position: 100, start: 100, end: 380 }],
    });
  });

  it("snaps top edges together and draws a horizontal guide spanning both boxes", () => {
    const moving = { x: 400, y: 96, width: 200, height: 80 };
    expect(alignBox(moving, [anchor], 5)).toEqual({
      x: 400,
      y: 100,
      guides: [{ orientation: "horizontal", position: 100, start: 100, end: 600 }],
    });
  });

  it("snaps centres of boxes of different sizes", () => {
    // The anchor's centre is at x = 200; a 100-wide box is centred when its left is 150.
    const moving = { x: 152, y: 300, width: 100, height: 40 };
    expect(alignBox(moving, [anchor], 5)).toMatchObject({ x: 150, guides: [{ position: 200 }] });
  });

  it("snaps a left edge to another box's right edge", () => {
    const moving = { x: 303, y: 300, width: 200, height: 80 };
    expect(alignBox(moving, [anchor], 5)).toMatchObject({ x: 300, guides: [{ position: 300 }] });
  });

  it("snaps both axes at once", () => {
    const moving = { x: 402, y: 98, width: 200, height: 80 };
    const other = { x: 400, y: 600, width: 200, height: 80 };
    const alignment = alignBox(moving, [anchor, other], 5);
    expect(alignment).toMatchObject({ x: 400, y: 100 });
    expect(alignment.guides.map((guide) => guide.orientation)).toEqual(["vertical", "horizontal"]);
  });

  it("prefers the nearest of several candidates", () => {
    const near = { x: 501, y: 0, width: 200, height: 80 };
    const far = { x: 504, y: 200, width: 200, height: 80 };
    const moving = { x: 500, y: 400, width: 200, height: 80 };
    expect(alignBox(moving, [far, near], 5).x).toBe(501);
  });

  it("treats a distance equal to the threshold as close enough", () => {
    const moving = { x: 105, y: 300, width: 200, height: 80 };
    expect(alignBox(moving, [anchor], 5).x).toBe(100);
    expect(alignBox({ ...moving, x: 105.01 }, [anchor], 5).x).toBe(105.01);
  });
});
