import type { Protocol } from "@rectangles/engine";

/**
 * How well two port protocols fit together, decided from the protocols alone so that no
 * rule is ever written for a pair of components.
 *
 * - `compatible`: the same protocol.
 * - `discouraged`: the engine can run it, but real systems rarely wire it this way.
 * - `incompatible`: the receiving port cannot understand what the sending port sends.
 */
export type Compatibility = "compatible" | "discouraged" | "incompatible";

/**
 * Every pair, listed in full so a new protocol cannot be added without deciding each of
 * its pairs (the type demands every key).
 */
const COMPATIBILITY: Readonly<Record<Protocol, Readonly<Record<Protocol, Compatibility>>>> = {
  "sync-request": {
    "sync-request": "compatible",
    // A request sent straight to a database. It runs, as one query per request.
    "database-query": "discouraged",
    "async-publish": "incompatible",
    "async-delivery": "incompatible",
  },
  "database-query": {
    "sync-request": "incompatible",
    "database-query": "compatible",
    "async-publish": "incompatible",
    "async-delivery": "incompatible",
  },
  "async-publish": {
    "sync-request": "incompatible",
    "database-query": "incompatible",
    "async-publish": "compatible",
    "async-delivery": "incompatible",
  },
  "async-delivery": {
    "sync-request": "incompatible",
    "database-query": "incompatible",
    "async-publish": "incompatible",
    "async-delivery": "compatible",
  },
};

export function compatibilityOf(from: Protocol, to: Protocol): Compatibility {
  return COMPATIBILITY[from][to];
}
