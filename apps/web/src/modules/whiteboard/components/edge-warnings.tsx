"use client";

import { createContext, useContext } from "react";
import type { RuleAdvice } from "../lib/connection-check";

/**
 * Connections on the board the rules warn about, by edge id. Worked out once per board
 * change by the canvas rather than by each connection.
 */
const EdgeWarningsContext = createContext<ReadonlyMap<string, RuleAdvice>>(new Map());

export const EdgeWarningsProvider = EdgeWarningsContext;

export function useEdgeWarning(edgeId: string): RuleAdvice | undefined {
  return useContext(EdgeWarningsContext).get(edgeId);
}
