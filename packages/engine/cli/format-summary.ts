import type { MetricResult, RunResult } from "../src/index.ts";

const wholeNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const decimalNumber = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const smallNumber = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 3 });
const percentage = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Whole numbers stay whole; fractions keep three significant digits. */
function formatValue(value: number): string {
  return Number.isInteger(value) ? wholeNumber.format(value) : smallNumber.format(value);
}

function formatMetric(metric: MetricResult): string {
  switch (metric.kind) {
    case "counter":
      return `${wholeNumber.format(metric.total)} ${metric.unit}`;
    case "gauge":
      return `mean ${formatValue(metric.mean)} · max ${formatValue(metric.max)} ${metric.unit}`;
    case "sample":
      return metric.count === 0
        ? "no samples"
        : `mean ${formatValue(metric.mean)} · p50 ${formatValue(metric.p50)} · p95 ${formatValue(metric.p95)} · p99 ${formatValue(metric.p99)} ${metric.unit}`;
  }
}

function formatStopReason(result: RunResult): string {
  switch (result.stopReason) {
    case "completed":
      return "completed";
    case "event-limit":
      return `stopped early: reached the limit of ${wholeNumber.format(result.eventsProcessed)} events`;
    case "time-limit":
      return `stopped early: reached the limit of ${formatValue(result.simulatedSeconds)} simulated seconds`;
    case null:
      return "still running";
  }
}

function formatRows(rows: readonly (readonly [string, string])[], indent: string): string[] {
  const labelWidth = Math.max(...rows.map(([label]) => label.length));
  return rows.map(([label, value]) => `${indent}${label.padEnd(labelWidth)}  ${value}`);
}

/** Renders a run result as plain text. The output depends only on the result. */
export function formatSummary(result: RunResult): string {
  const { summary } = result;
  const lines = [
    ...formatRows(
      [
        ["Seed", String(result.seed)],
        ["Simulated", `${formatValue(result.simulatedSeconds)} s`],
        ["Events", wholeNumber.format(result.eventsProcessed)],
        ["Run", formatStopReason(result)],
      ],
      "",
    ),
    "",
    "Traffic",
    ...formatRows(
      [
        [
          "Offered",
          `${decimalNumber.format(summary.offeredPerSecond)} requests/s (${wholeNumber.format(summary.offered)} requests)`,
        ],
        ["Throughput", `${decimalNumber.format(summary.throughputPerSecond)} requests/s`],
        [
          "Errors",
          `${percentage.format(summary.errorRate)} (rejected ${wholeNumber.format(summary.rejected)} · failed ${wholeNumber.format(summary.failed)} · timed out ${wholeNumber.format(summary.timedOut)})`,
        ],
        ["In flight at end", wholeNumber.format(summary.inFlight)],
        [
          "Latency",
          summary.latencyMs.count === 0
            ? "no successful requests"
            : `mean ${formatValue(summary.latencyMs.mean)} · p50 ${formatValue(summary.latencyMs.p50)} · p95 ${formatValue(summary.latencyMs.p95)} · p99 ${formatValue(summary.latencyMs.p99)} ms`,
        ],
      ],
      "  ",
    ),
  ];

  for (const node of result.nodes) {
    lines.push("", `${node.id} (${node.type})`);
    lines.push(...formatRows(node.metrics.map((metric) => [metric.id, formatMetric(metric)]), "  "));
  }

  if (result.edges.length > 0) {
    lines.push("", "Connections");
    lines.push(
      ...formatRows(
        result.edges.map((edge) => [
          edge.id,
          `${wholeNumber.format(edge.calls.sent)} calls sent · ${wholeNumber.format(edge.calls.replied)} answered`,
        ]),
        "  ",
      ),
    );
  }
  return `${lines.join("\n")}\n`;
}
