import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const nodes = (page: Page) => page.locator(".react-flow__node");
const nodeNamed = (page: Page, label: string) =>
  nodes(page).filter({ has: page.locator("[data-slot=node-label]").getByText(label, { exact: true }) });
const tile = (page: Page, name: string) => page.locator(`[data-slot=run-tile][data-metric="${name}"]`);

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

const summaryOf = (page: Page, label: string) => nodeNamed(page, label).locator("[data-slot=node-summary]");

declare global {
  interface Window {
    longTaskDurations: number[];
  }
}

test("run a board, overload it, and read the results", async ({ page }) => {
  // Records every main-thread task the browser reports as long (over 50 ms).
  await page.addInitScript(() => {
    window.longTaskDurations = [];
    new PerformanceObserver((list) => {
      window.longTaskDurations.push(...list.getEntries().map((entry) => entry.duration));
    }).observe({ type: "longtask" });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "New project" }).first().click();
  await expect(page).toHaveURL(/\/projects\/.+/);

  // Nothing can run yet, and the reason is on screen.
  const runStatus = page.getByRole("status", { name: "Run status" });
  const runButton = page.getByRole("button", { name: "Run", exact: true });
  await expect(runButton).toBeDisabled();
  await expect(runStatus).toHaveText("Add a component to the board first.");
  // The results panel stays out of the way until there is something in it.
  const results = page.getByRole("region", { name: "Run results" });
  await expect(results).toBeHidden();

  const board = await page.getByRole("main", { name: "Board" }).boundingBox();
  if (board === null) {
    throw new Error("The board is not visible.");
  }
  await dragFromLibrary(page, "Client", { x: board.x + 220, y: board.y + 150 });
  await dragFromLibrary(page, "API server", { x: board.x + 620, y: board.y + 150 });
  await expect(runStatus).toHaveText(/Connect a client/);

  // Each component shows its key settings on its face, without being opened.
  await expect(summaryOf(page, "Client")).toHaveText("100 req/s · steady");
  await expect(summaryOf(page, "API server")).toHaveText("2 × 50 slots · 20 ms");

  await drag(
    page,
    await centreOf(nodeNamed(page, "Client").locator(".react-flow__handle.source")),
    await centreOf(nodeNamed(page, "API server").locator(".react-flow__handle.target")),
  );
  await expect(runButton).toBeEnabled();

  // Run a two-minute test and skip the playback. The board must stay responsive throughout.
  await page.getByRole("combobox", { name: "Test duration" }).click();
  await page.getByRole("option", { name: "2 minutes" }).click();
  await page.evaluate(() => {
    window.longTaskDurations = [];
  });
  await runButton.click();
  await expect(results).toBeVisible();
  await page.getByRole("button", { name: "Skip to results" }).click();
  await expect(runStatus).toHaveText("Finished · 120 s");
  expect(Math.max(0, ...(await page.evaluate(() => window.longTaskDurations)))).toBeLessThan(100);

  // 100 requests a second against room for 5,000: everything succeeds.
  await expect(tile(page, "Throughput")).toContainText(/\d+ requests\/s/);
  await expect(tile(page, "Errors")).toContainText("0%");
  await expect(page.locator("[data-slot=edge-flow-label]")).toHaveText(/\d+\/s/);
  const serverLoad = nodeNamed(page, "API server").locator("[data-slot=node-run-overlay]");
  await expect(serverLoad).toHaveAttribute("data-capacity-state", "healthy");

  // Each metric of the selected component is listed with its definition.
  await nodeNamed(page, "API server").click();
  await results.getByRole("tab", { name: "API server" }).click();
  await expect(results.locator("[data-slot=node-metric]")).toHaveCount(5);
  await results.getByRole("button", { name: "What queue.depth means" }).hover();
  await expect(page.getByRole("tooltip")).toHaveText("Requests waiting for a free slot.");

  // Slow the server until it cannot keep up: 100 slots at 2 s each is 50 requests a second.
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  const serviceTime = inspector.getByRole("textbox", { name: "Service time" });
  await serviceTime.fill("2000");
  await serviceTime.press("Enter");
  await expect(summaryOf(page, "API server")).toHaveText("2 × 50 slots · 2 s");
  await expect(results.getByText(/from before your last change/)).toBeVisible();

  await page.getByRole("button", { name: "Run again" }).click();
  await page.getByRole("button", { name: "Skip to results" }).click();
  await expect(runStatus).toHaveText("Finished · 120 s");
  await expect(serverLoad).toHaveAttribute("data-capacity-state", "saturated");
  await expect(serverLoad).toContainText("queued");
  await results.getByRole("tab", { name: "Overview" }).click();
  await expect(tile(page, "Errors")).not.toContainText(/^Errors0%/);
  await page.screenshot({ path: "test-results/run-light.png" });

  // The dark theme applies at once and is remembered.
  await page.getByRole("button", { name: "Theme" }).click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(serverLoad).toHaveAttribute("data-capacity-state", "saturated");
  await expect(page.getByRole("menu")).toBeHidden();
  await page.screenshot({ path: "test-results/run-dark.png" });
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(nodeNamed(page, "API server")).toBeVisible();

  // Left to play, the run can be paused, resumed and stopped part-way.
  await runButton.click();
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(runStatus).toHaveText(/^Paused/);
  const pausedAt = await runStatus.textContent();
  await page.waitForTimeout(400);
  await expect(runStatus).toHaveText(pausedAt ?? "");
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(runStatus).not.toHaveText(/^Paused/);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(runStatus).toHaveText(/^Stopped at/);

  await page.getByRole("button", { name: "Clear results" }).click();
  await expect(results).toContainText("Nothing has run yet");
  await expect(serverLoad).toHaveCount(0);
});
