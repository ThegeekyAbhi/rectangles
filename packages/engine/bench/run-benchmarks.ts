import { writeFileSync } from "node:fs";
import { arch, cpus, platform } from "node:os";
import { Bench } from "tinybench";
import type { SimulationDesign } from "../src/index.ts";
import { registry, runSimulation } from "../src/index.ts";

const DEFAULT_MIN_EVENTS_PER_SECOND = 500_000;
const BASELINE_PATH = new URL("./baseline.json", import.meta.url);

function buildDesign(ratePerSecond: number): SimulationDesign {
  return {
    schemaVersion: 1,
    run: { durationSeconds: 60, seed: 1 },
    nodes: [
      { id: "client", type: "client", config: { ratePerSecond } },
      { id: "api", type: "api-server" },
    ],
    edges: [
      { id: "client-to-api", from: { node: "client", port: "out" }, to: { node: "api", port: "in" } },
    ],
  };
}

// The API server's default capacity is 5,000 requests/s, so the second scenario spends
// the whole run saturated: full queue, rejections, and close to the 2M event budget.
const scenarios = [
  { name: "steady: 1,000 requests/s for 60 s", design: buildDesign(1000) },
  { name: "saturated: 8,000 requests/s for 60 s", design: buildDesign(8000) },
];

const minEventsPerSecond = Number(
  process.env.BENCH_MIN_EVENTS_PER_SEC ?? DEFAULT_MIN_EVENTS_PER_SECOND,
);

const bench = new Bench({ name: "engine", time: 2000, warmupTime: 500 });
for (const scenario of scenarios) {
  bench.add(scenario.name, () => {
    runSimulation(scenario.design, { registry });
  });
}
await bench.run();

const results = scenarios.map((scenario) => {
  const result = bench.getTask(scenario.name)?.result;
  if (result?.state !== "completed") {
    throw new Error(`Benchmark "${scenario.name}" did not complete.`);
  }
  const { eventsProcessed, stopReason } = runSimulation(scenario.design, { registry });
  const meanRunMs = result.latency.mean;
  return {
    scenario: scenario.name,
    stopReason,
    eventsPerRun: eventsProcessed,
    meanRunMs: Math.round(meanRunMs * 100) / 100,
    eventsPerSecond: Math.round(eventsProcessed / (meanRunMs / 1000)),
    runs: result.latency.samplesCount,
  };
});

console.table(results);

const slowest = Math.min(...results.map((result) => result.eventsPerSecond));
writeFileSync(
  BASELINE_PATH,
  `${JSON.stringify(
    {
      machine: `${cpus()[0]?.model ?? "unknown CPU"}, ${platform()} ${arch()}`,
      node: process.version,
      minEventsPerSecond,
      results,
    },
    null,
    2,
  )}\n`,
);

if (slowest < minEventsPerSecond) {
  console.error(
    `Slowest scenario ran at ${slowest.toLocaleString("en-US")} events/s, below the required ${minEventsPerSecond.toLocaleString("en-US")}.`,
  );
  process.exit(1);
}
console.log(
  `Slowest scenario: ${slowest.toLocaleString("en-US")} events/s (required: ${minEventsPerSecond.toLocaleString("en-US")}).`,
);
