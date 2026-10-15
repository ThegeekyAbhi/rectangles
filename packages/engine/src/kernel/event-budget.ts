import type { ComponentRegistry } from "../contract/component-definition.ts";
import { microsToSeconds, secondsToMicros } from "../contract/time-units.ts";
import type { DesignGraph } from "./design-graph.ts";
import { buildDesignGraph } from "./design-graph.ts";
import { createSimulation, DEFAULT_MAX_EVENTS, DEFAULT_MAX_SIMULATED_SECONDS } from "./simulation.ts";

/** Events a probe may spend: a few tens of milliseconds of work. */
export const DEFAULT_PROBE_EVENTS = 100_000;

/** Halvings of the search for the stop time; far finer than anyone reads a time. */
const SEARCH_STEPS = 40;

/** Slices a probe is run in, so its progress can be read part-way. */
const PROBE_SLICES = 200;

/**
 * Two readings closer than this, relative to their size, cannot separate a steady cost
 * from a per-request cost, so the projection uses the per-request cost alone.
 */
const MIN_RELATIVE_DETERMINANT = 1e-3;

/** How far a run has got: a `RunSnapshot` or `RunResult` is one. */
export interface RunProgress {
  readonly simulatedSeconds: number;
  readonly eventsProcessed: number;
}

/** Whether a run will fit its event limit, and if not, when it will stop. */
export interface EventBudgetEstimate {
  readonly maxEvents: number;
  /** Events the whole run is expected to need. */
  readonly expectedEvents: number;
  /** Simulated second at which the run is expected to stop, or `null` if it should finish. */
  readonly expectedStopSeconds: number | null;
  /** Set when the probe ran the whole design: the numbers are measured, not estimated. */
  readonly isExact: boolean;
}

export interface EventBudgetOptions {
  readonly registry: ComponentRegistry;
  readonly maxEvents?: number;
  readonly probeEvents?: number;
}

/**
 * Projects a run's event use forward from two readings of its progress: one from about
 * half-way through what has run (`earlier`, optional) and the latest.
 */
export interface EventBudgetProjector {
  /** The simulated second at which the run is expected to stop, or `null` if it should finish. */
  projectStopSeconds(earlier: RunProgress | null, latest: RunProgress): number | null;
  /** Events the whole run is expected to need. */
  projectTotalEvents(earlier: RunProgress | null, latest: RunProgress): number;
}

/** Requests every traffic source will have originated by `seconds`, before retries. */
function plannedRequestsBy(graph: DesignGraph, seconds: number): number {
  let total = 0;
  for (const node of graph.nodes) {
    const { expectedRequests } = node.component.definition;
    if (expectedRequests !== undefined) {
      const targetCount = node.targetsByPort.reduce((sum, targets) => sum + targets.length, 0);
      total += expectedRequests(node.config, seconds, targetCount);
    }
  }
  return total;
}

/**
 * Events used by time `t`, modelled as `perSecond · t + perRequest · requests(t)`: a
 * steady cost (such as a source's timers) plus a cost for each planned request (its hops,
 * retries and timeouts). Both come from the readings, so no component is known by name,
 * and the planned requests follow the traffic pattern, so ramps and spikes project right.
 */
function eventsByTime(
  graph: DesignGraph,
  earlier: RunProgress | null,
  latest: RunProgress,
): ((seconds: number) => number) | null {
  const requestsBy = (seconds: number) => plannedRequestsBy(graph, seconds);
  const latestRequests = requestsBy(latest.simulatedSeconds);
  const floor = latest.eventsProcessed;

  if (earlier !== null && latestRequests > 0) {
    const earlierRequests = requestsBy(earlier.simulatedSeconds);
    const determinant = earlier.simulatedSeconds * latestRequests - latest.simulatedSeconds * earlierRequests;
    const scale = latest.simulatedSeconds * latestRequests;
    if (Math.abs(determinant) > MIN_RELATIVE_DETERMINANT * scale) {
      const perSecond =
        (earlier.eventsProcessed * latestRequests - latest.eventsProcessed * earlierRequests) / determinant;
      const perRequest =
        (earlier.simulatedSeconds * latest.eventsProcessed - latest.simulatedSeconds * earlier.eventsProcessed) /
        determinant;
      if (perSecond >= 0 && perRequest >= 0) {
        return (seconds) => Math.max(floor, perSecond * seconds + perRequest * requestsBy(seconds));
      }
    }
  }
  if (latestRequests > 0) {
    const perRequest = latest.eventsProcessed / latestRequests;
    return (seconds) => Math.max(floor, perRequest * requestsBy(seconds));
  }
  if (latest.simulatedSeconds > 0) {
    const perSecond = latest.eventsProcessed / latest.simulatedSeconds;
    return (seconds) => Math.max(floor, perSecond * seconds);
  }
  return null;
}

function runSeconds(graph: DesignGraph): number {
  return Math.min(graph.run.durationSeconds, DEFAULT_MAX_SIMULATED_SECONDS);
}

/** Bisects for the first time the events used reach `maxEvents`. Use never decreases. */
function findStopSeconds(
  eventsBy: (seconds: number) => number,
  fromSeconds: number,
  toSeconds: number,
  maxEvents: number,
): number {
  let low = fromSeconds;
  let high = toSeconds;
  for (let step = 0; step < SEARCH_STEPS; step++) {
    const middle = (low + high) / 2;
    if (eventsBy(middle) >= maxEvents) {
      high = middle;
    } else {
      low = middle;
    }
  }
  return high;
}

function createProjector(graph: DesignGraph, maxEvents: number): EventBudgetProjector {
  const durationSeconds = runSeconds(graph);
  return {
    projectTotalEvents(earlier, latest) {
      return eventsByTime(graph, earlier, latest)?.(durationSeconds) ?? latest.eventsProcessed;
    },
    projectStopSeconds(earlier, latest) {
      const eventsBy = eventsByTime(graph, earlier, latest);
      if (eventsBy === null || eventsBy(durationSeconds) < maxEvents) {
        return null;
      }
      return findStopSeconds(eventsBy, latest.simulatedSeconds, durationSeconds, maxEvents);
    },
  };
}

/**
 * Prepares projections for a design, building its graph once so each projection is a
 * few closed-form sums.
 * @throws {DesignError} if the design is malformed.
 */
export function createEventBudgetProjector(
  design: unknown,
  options: Omit<EventBudgetOptions, "probeEvents">,
): EventBudgetProjector {
  return createProjector(buildDesignGraph(design, options.registry), options.maxEvents ?? DEFAULT_MAX_EVENTS);
}

/**
 * Tells before a run whether it will fit the event limit. Runs the real engine for at
 * most `probeEvents`, which is exact for a small design, and otherwise projects the rest
 * from the probe's progress half-way and at its end.
 * @throws {DesignError} if the design is malformed.
 */
export function estimateEventBudget(design: unknown, options: EventBudgetOptions): EventBudgetEstimate {
  const maxEvents = options.maxEvents ?? DEFAULT_MAX_EVENTS;
  const probeEvents = Math.min(options.probeEvents ?? DEFAULT_PROBE_EVENTS, maxEvents);
  const graph = buildDesignGraph(design, options.registry);
  const probe = createSimulation(design, { registry: options.registry, limits: { maxEvents: probeEvents } });
  const readProgress = (): RunProgress => ({
    simulatedSeconds: microsToSeconds(probe.nowMicros),
    eventsProcessed: probe.eventsProcessed,
  });

  // Run in slices, keeping the last reading taken before half the probe's events were used.
  const stepMicros = Math.max(1, Math.floor(secondsToMicros(runSeconds(graph)) / PROBE_SLICES));
  let halfway: RunProgress | null = null;
  let isFinished = false;
  while (!isFinished) {
    isFinished = probe.step(probe.nowMicros + stepMicros);
    if (!isFinished && probe.eventsProcessed * 2 <= probeEvents) {
      halfway = readProgress();
    }
  }

  if (probe.stopReason !== "event-limit") {
    return { maxEvents, expectedEvents: probe.eventsProcessed, expectedStopSeconds: null, isExact: true };
  }
  const latest = readProgress();
  const projector = createProjector(graph, maxEvents);
  return {
    maxEvents,
    expectedEvents: projector.projectTotalEvents(halfway, latest),
    expectedStopSeconds: projector.projectStopSeconds(halfway, latest),
    isExact: false,
  };
}
