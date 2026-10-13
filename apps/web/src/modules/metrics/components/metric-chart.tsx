"use client";

import "uplot/dist/uPlot.min.css";
import { useEffect, useRef } from "react";
import uPlot from "uplot";
import { useAppliedTheme } from "../hooks/use-applied-theme";
import type { Chart, ChartTone } from "../lib/chart-series";
import { formatNumber } from "../lib/format-metric";

/** The design token each tone is drawn in, read from the page when the chart is built. */
const TONE_TOKEN: Record<ChartTone, string> = {
  strong: "--foreground",
  soft: "--muted-foreground",
  healthy: "--state-healthy",
  saturated: "--state-saturated",
};

const DASH = [4, 3];
const TONE_SWATCH: Record<ChartTone, string> = {
  strong: "border-foreground",
  soft: "border-muted-foreground",
  healthy: "border-state-healthy",
  saturated: "border-state-saturated",
};

/**
 * A time series chart of one or more lines against simulated seconds. Built once and
 * then fed new data, so a live run does not rebuild it ten times a second.
 */
export function MetricChart({
  chart,
  label,
  height = 120,
}: {
  chart: Chart;
  /** What the chart shows, for people who cannot see it. */
  label: string;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  // The latest chart, for the effect that builds the plot to read without re-running.
  const chartRef = useRef(chart);
  // Rebuilding is only needed when the lines themselves change, not their data.
  const linesKey = JSON.stringify(chart.lines);
  // The plot copies its colours from the tokens when built, so a new theme needs a new plot.
  const appliedTheme = useAppliedTheme();

  useEffect(() => {
    chartRef.current = chart;
  }, [chart]);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    const style = getComputedStyle(container);
    const colourOf = (token: string) => style.getPropertyValue(token).trim();
    const axisColour = colourOf("--muted-foreground");
    const gridColour = colourOf("--border");
    const font = `11px ${style.fontFamily}`;

    const plot = new uPlot(
      {
        width: Math.max(container.clientWidth, 1),
        height,
        legend: { show: false },
        cursor: { show: false },
        // The x axis is simulated seconds from the start of the run, not a date.
        scales: {
          x: { time: false },
          y: { range: (_plot, _min, max) => [0, max > 0 ? max * 1.1 : 1] },
        },
        axes: [
          {
            stroke: axisColour,
            font,
            size: 24,
            grid: { show: false },
            ticks: { stroke: gridColour, width: 1, size: 4 },
            values: (_plot, ticks) => ticks.map((tick) => `${formatNumber(tick)}s`),
          },
          {
            stroke: axisColour,
            font,
            size: 44,
            grid: { stroke: gridColour, width: 1 },
            ticks: { show: false },
            values: (_plot, ticks) => ticks.map((tick) => formatNumber(tick)),
          },
        ],
        series: [
          {},
          ...chartRef.current.lines.map((line) => ({
            label: line.label,
            stroke: colourOf(TONE_TOKEN[line.tone]),
            width: 1.5,
            points: { show: false },
            ...(line.isDashed === true ? { dash: DASH } : {}),
          })),
        ],
      },
      chartRef.current.columns,
      container,
    );
    plotRef.current = plot;

    const observer = new ResizeObserver(() => {
      plot.setSize({ width: Math.max(container.clientWidth, 1), height });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      plot.destroy();
      plotRef.current = null;
    };
  }, [linesKey, height, appliedTheme]);

  useEffect(() => {
    plotRef.current?.setData(chart.columns);
  }, [chart.columns]);

  const hasEnoughPoints = chart.columns[0].length >= 2;

  return (
    <figure className="min-w-0">
      <div className="relative" style={{ height }}>
        <div ref={containerRef} role="img" aria-label={label} className="absolute inset-0" />
        {!hasEnoughPoints && (
          <p className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            Waiting for two seconds of data
          </p>
        )}
      </div>
      {chart.lines.length > 1 && (
        <figcaption className="mt-1 flex gap-3 text-xs text-muted-foreground">
          {chart.lines.map((line) => (
            <span key={line.label} className="flex items-center gap-1.5">
              <span
                className={`w-3 border-t-2 ${TONE_SWATCH[line.tone]} ${line.isDashed ? "border-dashed" : ""}`}
                aria-hidden
              />
              {line.label}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
