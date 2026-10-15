// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { wcagContrast } from "culori";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  fileURLToPath(new URL("../../src/app/globals.css", import.meta.url)),
  "utf8",
);

/** The custom properties declared in one rule of the stylesheet, such as `:root`. */
function readTokens(selector: string): Map<string, string> {
  const start = stylesheet.indexOf(`\n${selector} {`);
  const block = stylesheet.slice(start, stylesheet.indexOf("\n}", start));
  const tokens = new Map<string, string>();
  for (const [, name, value] of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    if (name !== undefined && value !== undefined) {
      tokens.set(name, value.trim());
    }
  }
  return tokens;
}

const lightTokens = readTokens(":root");
// The dark theme redefines some roles and inherits the rest.
const darkTokens = new Map([...lightTokens, ...readTokens(".dark")]);

/** A token's colour with every `var()` inside it replaced by its value. */
function resolve(tokens: ReadonlyMap<string, string>, name: string): string {
  const value = tokens.get(name);
  if (value === undefined) {
    throw new Error(`Token ${name} is not defined.`);
  }
  return value.replace(/var\((--[\w-]+)\)/g, (_match, inner: string) => resolve(tokens, inner));
}

/** Text that must be readable, with the surfaces it is drawn on. */
const TEXT_ON_SURFACES: readonly (readonly [text: string, surfaces: readonly string[]])[] = [
  ["--foreground", ["--background", "--sidebar", "--card", "--popover", "--muted"]],
  ["--muted-foreground", ["--background", "--sidebar", "--card", "--popover", "--muted"]],
  ["--card-foreground", ["--card"]],
  ["--popover-foreground", ["--popover"]],
  ["--accent-foreground", ["--accent"]],
  ["--secondary-foreground", ["--secondary"]],
  ["--sidebar-foreground", ["--sidebar"]],
  ["--primary-foreground", ["--primary"]],
];
/** Colours that carry meaning as graphics: load states and component category icons. */
const GRAPHIC_COLOURS = [
  "--state-healthy",
  "--state-busy",
  "--state-saturated",
  "--category-traffic",
  "--category-compute",
  "--category-data",
  "--category-messaging",
];
const GRAPHIC_SURFACES = ["--background", "--card"];

/** WCAG 2 AA: 4.5 for body text, 3 for large text and for graphics that carry meaning. */
const TEXT_CONTRAST = 4.5;
const GRAPHIC_CONTRAST = 3;

describe.each([
  ["light", lightTokens],
  ["dark", darkTokens],
] as const)("%s theme", (_theme, tokens) => {
  it.each(TEXT_ON_SURFACES.flatMap(([text, surfaces]) => surfaces.map((surface) => [text, surface] as const)))(
    "%s is readable on %s",
    (text, surface) => {
      const contrast = wcagContrast(resolve(tokens, text), resolve(tokens, surface));
      expect(contrast).toBeGreaterThanOrEqual(TEXT_CONTRAST);
    },
  );

  it.each(GRAPHIC_COLOURS.flatMap((colour) => GRAPHIC_SURFACES.map((surface) => [colour, surface] as const)))(
    "%s stands out on %s",
    (colour, surface) => {
      const contrast = wcagContrast(resolve(tokens, colour), resolve(tokens, surface));
      expect(contrast).toBeGreaterThanOrEqual(GRAPHIC_CONTRAST);
    },
  );
});

describe("dark theme surfaces", () => {
  it("get lighter as they come forward", () => {
    const lightnessOf = (name: string) => Number(/oklch\(([\d.]+)/.exec(resolve(darkTokens, name))?.[1]);
    const ladder = ["--sidebar", "--background", "--card", "--popover", "--muted"].map(lightnessOf);
    expect(ladder).toEqual([...ladder].sort((left, right) => left - right));
    expect(new Set(ladder).size).toBe(ladder.length);
  });
});
