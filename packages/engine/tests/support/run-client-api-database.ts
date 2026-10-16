import type { RunResult } from "../../src/metrics/run-result.ts";
import type { ClientApiDatabaseDesignOptions } from "./client-api-database-design.ts";
import { buildClientApiDatabaseDesign } from "./client-api-database-design.ts";
import { runToCompletion } from "./run-to-completion.ts";

export const READS_ONLY = { readRatio: 1 };
export const WRITES_ONLY = { readRatio: 0 };

/** Runs client → API server → database to the end. */
export function runClientApiDatabase(options: ClientApiDatabaseDesignOptions): RunResult {
  return runToCompletion(buildClientApiDatabaseDesign(options));
}
