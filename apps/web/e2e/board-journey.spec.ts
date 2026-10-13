import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const nodes = (page: Page) => page.locator(".react-flow__node");
const edges = (page: Page) => page.locator(".react-flow__edge");
const nodeNamed = (page: Page, label: string) =>
  nodes(page).filter({ has: page.locator("[data-slot=node-label]").getByText(label, { exact: true }) });

async function centreOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("Element is not visible.");
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Drags with real pointer movement, in steps, the way a person would. */
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

test("build a ten-node board, edit it, and find it unchanged after a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New project" }).first().click();
  await expect(page).toHaveURL(/\/projects\/.+/);
  await expect(page.getByText("This board is empty")).toBeVisible();

  // Two columns of five: clients on the left, API servers on the right.
  const board = await page.getByRole("main", { name: "Board" }).boundingBox();
  if (board === null) {
    throw new Error("The board is not visible.");
  }
  for (let row = 0; row < 5; row++) {
    const y = board.y + 110 + row * 110;
    await dragFromLibrary(page, "Client", { x: board.x + 220, y });
    await dragFromLibrary(page, "API server", { x: board.x + 620, y });
  }
  await expect(nodes(page)).toHaveCount(10);
  await expect(nodeNamed(page, "API server 5")).toBeVisible();

  // Connect the first three clients to the API server beside them.
  const pairs = [
    ["Client", "API server"],
    ["Client 2", "API server 2"],
    ["Client 3", "API server 3"],
  ] as const;
  for (const [client, server] of pairs) {
    await drag(
      page,
      await centreOf(nodeNamed(page, client).locator(".react-flow__handle.source")),
      await centreOf(nodeNamed(page, server).locator(".react-flow__handle.target")),
    );
  }
  await expect(edges(page)).toHaveCount(3);
  // Each connection points at the component that receives the requests.
  await expect(edges(page).first().locator("path.react-flow__edge-path")).toHaveAttribute(
    "marker-end",
    /connection-arrow/,
  );

  // A connection that makes no structural sense is refused: API server to API server.
  await drag(
    page,
    await centreOf(nodeNamed(page, "API server 4").locator(".react-flow__handle.target")),
    await centreOf(nodeNamed(page, "API server 5").locator(".react-flow__handle.target")),
  );
  await expect(edges(page)).toHaveCount(3);

  // Configure a node: a valid value is kept, an invalid one is refused with a reason.
  await nodeNamed(page, "API server 2").click();
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  const instances = inspector.getByLabel("Instances");
  await expect(instances).toHaveValue("2");
  await instances.fill("6");
  await instances.press("Enter");
  await instances.fill("0");
  await instances.press("Enter");
  await expect(inspector.getByRole("alert")).toHaveText("Must be between 1 and 1000.");

  const name = inspector.getByLabel("Name");
  await name.fill("Checkout API");
  await name.press("Enter");
  await expect(nodeNamed(page, "Checkout API")).toBeVisible();

  // Undo and redo the rename from the keyboard, away from the text field.
  await page.locator(".react-flow__pane").click({ position: { x: 20, y: 20 } });
  await page.keyboard.press("ControlOrMeta+z");
  await expect(nodeNamed(page, "API server 2")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(nodeNamed(page, "Checkout API")).toBeVisible();

  // Delete a node with its connection, then undo: both come back in one step.
  await nodeNamed(page, "Client 3").click();
  await page.keyboard.press("Backspace");
  await expect(nodes(page)).toHaveCount(9);
  await expect(edges(page)).toHaveCount(2);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(nodes(page)).toHaveCount(10);
  await expect(edges(page)).toHaveCount(3);

  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await page.screenshot({ path: "test-results/board.png" });
  await page.reload();

  await expect(nodes(page)).toHaveCount(10);
  await expect(edges(page)).toHaveCount(3);
  await nodeNamed(page, "Checkout API").click();
  await expect(inspector.getByLabel("Instances")).toHaveValue("6");
});

test("a project can be renamed, duplicated, deleted and restored", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New project" }).first().click();
  await expect(page).toHaveURL(/\/projects\/.+/);
  await page.getByRole("link", { name: "Back to projects" }).click();

  const projects = page.getByRole("main").getByRole("listitem");
  await expect(projects).toHaveCount(1);

  await page.getByRole("button", { name: "Actions for Untitled project" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const renameDialog = page.getByRole("dialog", { name: "Rename project" });
  await renameDialog.getByLabel("Name").fill("Checkout flow");
  await renameDialog.getByRole("button", { name: "Rename" }).click();
  await expect(page.getByRole("link", { name: /Checkout flow/ })).toBeVisible();

  await page.getByRole("button", { name: "Actions for Checkout flow" }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(page.getByRole("link", { name: /Checkout flow copy/ })).toBeVisible();
  await expect(projects).toHaveCount(2);

  await page.getByRole("button", { name: "Actions for Checkout flow copy" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(projects).toHaveCount(1);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(projects).toHaveCount(2);
});

test("panels can be hidden, resized, and are remembered", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New project" }).first().click();
  await expect(page).toHaveURL(/\/projects\/.+/);

  const library = page.getByRole("complementary", { name: "Component library" });
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  const pane = page.locator(".react-flow__pane");
  await expect(library).toBeVisible();

  // The inspector follows the selection: there when something is selected, gone when not.
  await expect(inspector).toBeHidden();
  await library.getByRole("button", { name: /^Client/ }).click();
  await expect(inspector).toBeVisible();
  await pane.click({ position: { x: 20, y: 20 } });
  await expect(inspector).toBeHidden();
  await nodeNamed(page, "Client").click();
  await expect(inspector).toBeVisible();

  // Each side panel hides completely, from its button or its key, and comes back.
  await page.getByRole("button", { name: "Hide components" }).click();
  await expect(library).toBeHidden();
  await page.keyboard.press("[");
  await expect(library).toBeVisible();
  await page.keyboard.press("]");
  await expect(inspector).toBeHidden();
  await page.getByRole("button", { name: "Show inspector" }).click();
  await expect(inspector).toBeVisible();

  // Dragging a panel's edge resizes it, and the size survives a reload.
  const widthOf = async (panel: Locator) => (await panel.boundingBox())?.width ?? 0;
  const startWidth = await widthOf(inspector);
  const edge = await centreOf(page.getByRole("separator", { name: "Resize inspector" }));
  await drag(page, edge, { x: edge.x - 100, y: edge.y });
  const widerWidth = await widthOf(inspector);
  expect(widerWidth).toBeGreaterThan(startWidth + 80);

  // Dragging the edge past the panel's minimum hides it.
  const libraryEdge = await centreOf(page.getByRole("separator", { name: "Resize component library" }));
  await drag(page, libraryEdge, { x: 20, y: libraryEdge.y });
  await expect(library).toBeHidden();

  await page.reload();
  await expect(library).toBeHidden();
  await nodeNamed(page, "Client").click();
  await expect(inspector).toBeVisible();
  expect(Math.abs((await widthOf(inspector)) - widerWidth)).toBeLessThan(2);
});

test("the canvas opens the inspector on a double-click and can hide its minimap", async ({ page }) => {
  // With no theme chosen the app follows the system, so this board is drawn dark.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await page.getByRole("button", { name: "New project" }).first().click();
  await expect(page).toHaveURL(/\/projects\/.+/);

  const board = await page.getByRole("main", { name: "Board" }).boundingBox();
  if (board === null) {
    throw new Error("The board is not visible.");
  }
  await dragFromLibrary(page, "Client", { x: board.x + 200, y: board.y + 160 });
  await dragFromLibrary(page, "API server", { x: board.x + 560, y: board.y + 160 });
  await page.locator(".react-flow__pane").click({ position: { x: 20, y: 20 } });

  // Once turned off, the inspector stays away when a component is selected, and
  // double-clicking a component brings it back, showing that component.
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await page.keyboard.press("]");
  await nodeNamed(page, "Client").click();
  await expect(inspector).toBeHidden();
  await nodeNamed(page, "API server").dblclick();
  await expect(inspector).toBeVisible();
  await expect(inspector.getByLabel("Name")).toHaveValue("API server");
  await page.screenshot({ path: "test-results/canvas-dark-selected.png" });

  // The minimap hides from its button or its key, and stays hidden after a reload.
  const minimap = page.locator(".react-flow__minimap");
  await page.locator(".react-flow__pane").click({ position: { x: 20, y: 20 } });
  await page.screenshot({ path: "test-results/canvas-dark.png" });
  await expect(minimap).toBeVisible();
  await page.getByRole("button", { name: "Hide minimap" }).click();
  await expect(minimap).toBeHidden();
  await page.keyboard.press("m");
  await expect(minimap).toBeVisible();
  await page.keyboard.press("m");
  await page.reload();
  await expect(nodeNamed(page, "Client")).toBeVisible();
  await expect(minimap).toBeHidden();

  // The library's credit stays on the board.
  await expect(page.locator(".react-flow__attribution a")).toBeVisible();
});
