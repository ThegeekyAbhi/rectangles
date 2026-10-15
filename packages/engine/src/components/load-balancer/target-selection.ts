/**
 * How a load balancer picks one of its targets. Plain functions over typed arrays, so a
 * pick allocates nothing and costs one or two passes over the targets.
 */

/** Returned when no target may be picked. */
export const NO_TARGET = -1;

/**
 * Cost of a target with requests in flight but no response time measured yet, as in
 * Finagle's peak EWMA: high enough that it gets one request at a time until one returns.
 */
const UNMEASURED_COST = Number.MAX_VALUE / 2;

export type SelectionAlgorithm = "round-robin" | "least-connections" | "least-time";

/** What a load balancer knows about each of its targets, indexed by target. */
export interface TargetTable {
  readonly weight: Int32Array;
  readonly inFlight: Int32Array;
  /** Smooth weighted round robin's running score. */
  readonly currentWeight: Float64Array;
  /** 1 while passive health checks have taken the target out of rotation. */
  readonly isEjected: Uint8Array;
  /** Recent response time, rising at once to a slower response and decaying towards faster ones. */
  readonly peakEwmaMicros: Float64Array;
  /** Scratch space for one pick's costs. */
  readonly cost: Float64Array;
}

export function createTargetTable(weights: readonly number[]): TargetTable {
  const count = weights.length;
  return {
    weight: Int32Array.from(weights),
    inFlight: new Int32Array(count),
    currentWeight: new Float64Array(count),
    isEjected: new Uint8Array(count),
    peakEwmaMicros: new Float64Array(count),
    cost: new Float64Array(count),
  };
}

function isCandidate(table: TargetTable, index: number, excluded: number, ignoreEjection: boolean): boolean {
  return index !== excluded && (ignoreEjection || table.isEjected[index] === 0);
}

/**
 * NGINX's smooth weighted round robin among the targets whose cost equals `cost`. Every
 * candidate's score rises by its weight, the highest wins and drops by the total. Weights
 * 5, 1, 1 give a a b a c a a: spread out, not bunched.
 */
function smoothWeightedRoundRobin(
  table: TargetTable,
  excluded: number,
  ignoreEjection: boolean,
  cost: number,
): number {
  const { weight, currentWeight } = table;
  let best = NO_TARGET;
  let totalWeight = 0;
  for (let index = 0; index < weight.length; index++) {
    if (!isCandidate(table, index, excluded, ignoreEjection) || table.cost[index] !== cost) {
      continue;
    }
    const targetWeight = weight[index] ?? 0;
    const score = (currentWeight[index] ?? 0) + targetWeight;
    currentWeight[index] = score;
    totalWeight += targetWeight;
    if (best === NO_TARGET || score > (currentWeight[best] ?? 0)) {
      best = index;
    }
  }
  if (best !== NO_TARGET) {
    currentWeight[best] = (currentWeight[best] ?? 0) - totalWeight;
  }
  return best;
}

function costOf(table: TargetTable, algorithm: SelectionAlgorithm, index: number): number {
  const inFlight = table.inFlight[index] ?? 0;
  const weight = table.weight[index] ?? 1;
  switch (algorithm) {
    case "round-robin":
      return 0;
    case "least-connections":
      return inFlight / weight;
    case "least-time": {
      const peakEwmaMicros = table.peakEwmaMicros[index] ?? 0;
      if (peakEwmaMicros === 0) {
        return inFlight === 0 ? 0 : UNMEASURED_COST;
      }
      return (peakEwmaMicros * (inFlight + 1)) / weight;
    }
  }
}

/**
 * The lowest-cost candidate, with ties shared out by weight as NGINX does. Round robin
 * gives every target the same cost, so it is the tie-break alone.
 */
function pickAmong(
  table: TargetTable,
  algorithm: SelectionAlgorithm,
  excluded: number,
  ignoreEjection: boolean,
): number {
  let lowest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < table.weight.length; index++) {
    if (isCandidate(table, index, excluded, ignoreEjection)) {
      const cost = costOf(table, algorithm, index);
      table.cost[index] = cost;
      lowest = Math.min(lowest, cost);
    }
  }
  return lowest === Number.POSITIVE_INFINITY
    ? NO_TARGET
    : smoothWeightedRoundRobin(table, excluded, ignoreEjection, lowest);
}

/**
 * Picks a target other than `excluded` (pass `NO_TARGET` to allow any). Ejected targets
 * are skipped unless every candidate is ejected; then all are used, like Envoy's panic
 * mode, because sending to a struggling target beats sending nowhere.
 */
export function pickTarget(table: TargetTable, algorithm: SelectionAlgorithm, excluded: number): number {
  const target = pickAmong(table, algorithm, excluded, false);
  return target === NO_TARGET ? pickAmong(table, algorithm, excluded, true) : target;
}

/**
 * Folds one response time into a target's peak EWMA (Finagle, Linkerd): a slower response
 * is taken at once, a faster one only pulls the average down as time passes.
 */
export function recordResponseTime(
  table: TargetTable,
  index: number,
  responseMicros: number,
  sinceLastSampleMicros: number,
  decayMicros: number,
): void {
  const previous = table.peakEwmaMicros[index] ?? 0;
  if (responseMicros > previous) {
    table.peakEwmaMicros[index] = responseMicros;
    return;
  }
  const keep = Math.exp(-sinceLastSampleMicros / decayMicros);
  table.peakEwmaMicros[index] = previous * keep + responseMicros * (1 - keep);
}
