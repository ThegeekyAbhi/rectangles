import type { MetricHandle, MetricSpec } from "../contract/metric.ts";
import type { Micros } from "../contract/time-units.ts";

const INITIAL_SAMPLE_CAPACITY = 1024;

export class CounterSeries {
  readonly kind = "counter";
  readonly windows: Float64Array;
  total = 0;

  constructor(windowCount: number) {
    this.windows = new Float64Array(windowCount);
  }
}

export class GaugeSeries {
  readonly kind = "gauge";
  /** Per window: the gauge's value integrated over time, in value × microseconds. */
  readonly integrals: Float64Array;
  value = 0;
  max = 0;
  integratedToMicros: Micros = 0;

  constructor(windowCount: number) {
    this.integrals = new Float64Array(windowCount);
  }
}

export class SampleSeries {
  readonly kind = "sample";
  /** Every recorded value, in the order recorded (which is time order). */
  values = new Float64Array(INITIAL_SAMPLE_CAPACITY);
  length = 0;
  readonly windowCounts: Uint32Array;

  constructor(windowCount: number) {
    this.windowCounts = new Uint32Array(windowCount);
  }
}

export type MetricSeries = CounterSeries | GaugeSeries | SampleSeries;

export interface RegisteredMetric {
  readonly nodeIndex: number;
  readonly spec: MetricSpec;
  readonly series: MetricSeries;
}

/**
 * Stores every metric of a run in fixed-length windows.
 *
 * Recording allocates nothing, apart from the sample buffer doubling when it fills.
 */
export class MetricRecorder {
  readonly windowMicros: Micros;
  readonly windowCount: number;
  readonly metrics: RegisteredMetric[] = [];

  constructor(windowMicros: Micros, windowCount: number) {
    this.windowMicros = windowMicros;
    this.windowCount = windowCount;
  }

  register(nodeIndex: number, spec: MetricSpec): MetricHandle {
    const series =
      spec.kind === "counter"
        ? new CounterSeries(this.windowCount)
        : spec.kind === "gauge"
          ? new GaugeSeries(this.windowCount)
          : new SampleSeries(this.windowCount);
    this.metrics.push({ nodeIndex, spec, series });
    return this.metrics.length - 1;
  }

  count(handle: MetricHandle, amount: number, nowMicros: Micros): void {
    this.countInto(this.seriesOf(handle, "counter"), amount, nowMicros);
  }

  /** Adds to a counter that is not one of a component's metrics, such as an edge's. */
  countInto(series: CounterSeries, amount: number, nowMicros: Micros): void {
    series.windows[this.windowIndexAt(nowMicros)]! += amount;
    series.total += amount;
  }

  setGauge(handle: MetricHandle, value: number, nowMicros: Micros): void {
    const series = this.seriesOf(handle, "gauge");
    this.integrate(series, nowMicros);
    series.value = value;
    if (value > series.max) {
      series.max = value;
    }
  }

  sample(handle: MetricHandle, value: number, nowMicros: Micros): void {
    const series = this.seriesOf(handle, "sample");
    if (series.length === series.values.length) {
      const grown = new Float64Array(series.values.length * 2);
      grown.set(series.values);
      series.values = grown;
    }
    series.values[series.length++] = value;
    series.windowCounts[this.windowIndexAt(nowMicros)]!++;
  }

  /** Brings every gauge's time integral up to `nowMicros`. Safe to call repeatedly. */
  integrateGauges(nowMicros: Micros): void {
    for (const metric of this.metrics) {
      if (metric.series.kind === "gauge") {
        this.integrate(metric.series, nowMicros);
      }
    }
  }

  /** How many windows have started by a moment. */
  windowsElapsedAt(nowMicros: Micros): number {
    return Math.min(Math.ceil(nowMicros / this.windowMicros), this.windowCount);
  }

  private windowIndexAt(nowMicros: Micros): number {
    return Math.min(Math.floor(nowMicros / this.windowMicros), this.windowCount - 1);
  }

  private integrate(series: GaugeSeries, nowMicros: Micros): void {
    let fromMicros = series.integratedToMicros;
    if (nowMicros <= fromMicros) {
      return;
    }
    series.integratedToMicros = nowMicros;
    if (series.value === 0) {
      return;
    }
    while (fromMicros < nowMicros) {
      const windowIndex = this.windowIndexAt(fromMicros);
      const windowEndMicros =
        windowIndex === this.windowCount - 1 ? nowMicros : (windowIndex + 1) * this.windowMicros;
      const toMicros = Math.min(windowEndMicros, nowMicros);
      series.integrals[windowIndex]! += series.value * (toMicros - fromMicros);
      fromMicros = toMicros;
    }
  }

  private seriesOf<Kind extends MetricSeries["kind"]>(
    handle: MetricHandle,
    kind: Kind,
  ): Extract<MetricSeries, { kind: Kind }> {
    const metric = this.metrics[handle];
    if (metric?.series.kind !== kind) {
      const actual = metric === undefined ? "not registered" : `a ${metric.spec.kind}`;
      throw new TypeError(`Metric handle ${handle} was recorded as a ${kind} but is ${actual}.`);
    }
    return metric.series as Extract<MetricSeries, { kind: Kind }>;
  }
}
