import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const nodes = (page: Page) => page.locator(".react-flow__node");
const nodeNamed = (page: Page, label: string) =>
  nodes(page).filter({ has: page.locator("[data-slot=node-label]").getByText(label, { exact: true }) });

async function centreOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("Element is not visible.");
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
}

async function dragFromLibrary(page: Page, component: string, to: { x: number; y: number }) {
  const item = page.getByRole("complementary", { name: "Component library" }).getByRole("button", {
    name: new RegExp(`^${component}`),
  });
  await drag(page, await centreOf(item), to);
}

/** The middle of a component's tile, in screen pixels. */
const tileCentre = (page: Page, label: string) => centreOf(nodeNamed(page, label).locator(":scope > div").first());

test("scale a server out, scramble the board, and tidy it into a clean left-to-right layout", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New project" }).first().click();
  await expect(page).toHaveURL(/\/projects\/.+/);
  const board = await page.getByRole("main", { name: "Board" }).boundingBox();
  if (board === null) {
    throw new Error("The board is not visible.");
  }

  // Client → API server, then scale the server out from the inspector.
  await dragFromLibrary(page, "Client", { x: board.x + 200, y: board.y + 200 });
  await dragFromLibrary(page, "API server", { x: board.x + 520, y: board.y + 260 });
  await drag(
    page,
    await centreOf(nodeNamed(page, "Client").locator(".react-flow__handle.source")),
    await centreOf(nodeNamed(page, "API server").locator(".react-flow__handle.target")),
  );
  await nodeNamed(page, "API server").click();
  await page.getByRole("button", { name: "Add a copy behind a load balancer" }).click();
  await expect(nodeNamed(page, "Load balancer")).toBeVisible();
  await expect(nodeNamed(page, "API server 2")).toBeVisible();
  await expect(page.locator(".react-flow__edge")).toHaveCount(3);

  // Scramble it.
  await drag(page, await tileCentre(page, "API server 2"), { x: board.x + 260, y: board.y + 520 });
  await drag(page, await tileCentre(page, "Load balancer"), { x: board.x + 700, y: board.y + 120 });
  await page.locator(".react-flow__pane").click({ position: { x: 10, y: 10 } });
  await page.screenshot({ path: test.info().outputPath("before-tidy.png") });

  await page.getByRole("button", { name: "Tidy up" }).click();
  // The dev server compiles the layout worker on first use, so the first tidy may take a while.
  await expect(page.getByText("Board tidied")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("4 components laid out left to right")).toBeVisible();
  // Let the glide and the fit finish.
  await page.waitForTimeout(800);
  await page.screenshot({ path: test.info().outputPath("after-tidy.png") });

  const client = await tileCentre(page, "Client");
  const balancer = await tileCentre(page, "Load balancer");
  const first = await tileCentre(page, "API server");
  const second = await tileCentre(page, "API server 2");
  // Left to right, one column per hop, with the main path straight and the fan-out centred.
  expect(client.x).toBeLessThan(balancer.x);
  expect(balancer.x).toBeLessThan(first.x);
  expect(Math.abs(first.x - second.x)).toBeLessThan(2);
  expect(Math.abs(client.y - balancer.y)).toBeLessThan(2);
  expect(Math.abs(balancer.y - (first.y + second.y) / 2)).toBeLessThan(12);

  // One undo puts everything back.
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(300);
  const restored = await tileCentre(page, "Load balancer");
  expect(Math.abs(restored.y - balancer.y)).toBeGreaterThan(20);
});
