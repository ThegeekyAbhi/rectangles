export type {
  Behaviour,
  Component,
  ComponentDefinition,
  ComponentRegistry,
  RegisteredComponent,
} from "./contract/component-definition.ts";
export type {
  ChoiceField,
  ConfigField,
  ConfigFields,
  ConfigOf,
  FieldRelevance,
  NumberField,
} from "./contract/config-field.ts";
export type { MetricKind, MetricSpec } from "./contract/metric.ts";
export type { Micros } from "./contract/time-units.ts";
export {
  MICROS_PER_MILLISECOND,
  MICROS_PER_SECOND,
  microsToMilliseconds,
  microsToSeconds,
  millisecondsToMicros,
  secondsToMicros,
} from "./contract/time-units.ts";
export { CAPACITY_METRIC_IDS, END_TO_END_METRIC_IDS } from "./contract/metric.ts";
export type { PortDirection, PortSpec, Protocol } from "./contract/port.ts";
export type { Operation, Outcome } from "./contract/request.ts";
export type { ConfigIssue, ConfigValidation, ValidatedConfig } from "./kernel/config-validation.ts";
export { validateConfig } from "./kernel/config-validation.ts";
export type {
  DesignEdge,
  DesignIssue,
  DesignIssueCode,
  DesignNode,
  PortReference,
  RunSettings,
  SimulationDesign,
} from "./kernel/design-graph.ts";
export { DesignError, findDesignIssues } from "./kernel/design-graph.ts";
export type {
  EventBudgetEstimate,
  EventBudgetOptions,
  EventBudgetProjector,
  RunProgress,
} from "./kernel/event-budget.ts";
export { createEventBudgetProjector, DEFAULT_PROBE_EVENTS, estimateEventBudget } from "./kernel/event-budget.ts";
export type { Simulation, SimulationLimits, SimulationOptions } from "./kernel/simulation.ts";
export {
  createSimulation,
  DEFAULT_MAX_EVENTS,
  DEFAULT_MAX_SIMULATED_SECONDS,
  runSimulation,
} from "./kernel/simulation.ts";
export type { MetricResult, NodeResult, RunResult, SampleResult } from "./metrics/run-result.ts";
export type {
  CallCounts,
  CounterResult,
  EdgeResult,
  GaugeResult,
  MetricSnapshot,
  NodeSnapshot,
  RunSnapshot,
  SampleSnapshot,
  StopReason,
} from "./metrics/run-snapshot.ts";
export type { RunSummary, TrafficSummary, WindowSummary } from "./metrics/run-summary.ts";
export type { SampleStatistics } from "./metrics/sample-statistics.ts";
export { createRegistry, registry } from "./registry.ts";
