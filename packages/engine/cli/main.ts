import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { DesignError, registry, runSimulation } from "../src/index.ts";
import { formatSummary } from "./format-summary.ts";

const USAGE = `Usage: pnpm sim <design.json> [options]

Options:
  --seed <n>        Override the design's seed
  --duration <s>    Override the design's duration, in simulated seconds
  --json            Print the full result as JSON instead of a summary
  --help            Show this message
`;

const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;

function fail(message: string, exitCode: number): never {
  process.stderr.write(`${message}\n`);
  process.exit(exitCode);
}

function parseNumberOption(name: string, value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (value.trim() === "" || Number.isNaN(parsed)) {
    fail(`--${name} needs a number, got "${value}".\n\n${USAGE}`, EXIT_USAGE);
  }
  return parsed;
}

function readDesign(designPath: string): Record<string, unknown> {
  let text: string;
  try {
    text = readFileSync(designPath, "utf8");
  } catch (error) {
    fail(`Cannot read ${designPath}: ${error instanceof Error ? error.message : String(error)}`, EXIT_FAILURE);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    fail(`${designPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`, EXIT_FAILURE);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    fail(`${designPath} must contain a JSON object.`, EXIT_FAILURE);
  }
  return parsed as Record<string, unknown>;
}

function parseCommandLine() {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        seed: { type: "string" },
        duration: { type: "string" },
        json: { type: "boolean", default: false },
        help: { type: "boolean", default: false },
      },
    });
  } catch (error) {
    fail(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`, EXIT_USAGE);
  }
}

const { values, positionals } = parseCommandLine();
if (values.help) {
  process.stdout.write(USAGE);
  process.exit(0);
}
const [designArgument, ...extraArguments] = positionals;
if (designArgument === undefined || extraArguments.length > 0) {
  fail(USAGE, EXIT_USAGE);
}

// pnpm runs scripts from the package root; INIT_CWD is where the user actually was.
const designPath = resolve(process.env.INIT_CWD ?? process.cwd(), designArgument);
const design = readDesign(designPath);
const seed = parseNumberOption("seed", values.seed);
const durationSeconds = parseNumberOption("duration", values.duration);
const savedRun = typeof design.run === "object" && design.run !== null ? design.run : {};
const designToRun = {
  ...design,
  run: {
    ...savedRun,
    ...(seed === undefined ? {} : { seed }),
    ...(durationSeconds === undefined ? {} : { durationSeconds }),
  },
};

try {
  const startedAtMs = performance.now();
  const result = runSimulation(designToRun, { registry });
  const elapsedSeconds = (performance.now() - startedAtMs) / 1000;

  process.stdout.write(values.json ? `${JSON.stringify(result, null, 2)}\n` : formatSummary(result));
  // Timing goes to stderr so that stdout is identical for identical inputs.
  const eventsPerSecond = Math.round(result.eventsProcessed / elapsedSeconds);
  process.stderr.write(
    `\n${elapsedSeconds.toFixed(3)} s wall time · ${eventsPerSecond.toLocaleString("en-US")} events/s\n`,
  );
} catch (error) {
  if (error instanceof DesignError) {
    fail(error.message, EXIT_FAILURE);
  }
  throw error;
}
