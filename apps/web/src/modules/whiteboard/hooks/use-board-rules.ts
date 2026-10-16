import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import type { BoardRuleView, RuleAdvice } from "../lib/connection-check";
import { boardRuleView, edgeRuleInputs, nodeRuleInputs, warnedEdges } from "../lib/connection-check";
import { useWhiteboardStore } from "../store/whiteboard-store-context";

export interface BoardRules extends BoardRuleView {
  /** Connections on the board the rules warn about, by edge id. */
  readonly warnings: ReadonlyMap<string, RuleAdvice>;
}

/**
 * The board as the connection rules see it, rebuilt only when a component or connection
 * is added, removed, renamed or rewired: not while one is dragged or selected.
 */
export function useBoardRules(): BoardRules {
  const nodeInputs = useWhiteboardStore(useShallow((state) => nodeRuleInputs(state.nodes)));
  const edgeInputs = useWhiteboardStore(useShallow((state) => edgeRuleInputs(state.edges)));
  return useMemo(() => {
    const view = boardRuleView(nodeInputs, edgeInputs);
    return { ...view, warnings: warnedEdges(view) };
  }, [nodeInputs, edgeInputs]);
}
