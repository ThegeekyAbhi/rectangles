import type { SimulationDesign } from "@rectangles/engine";
import { END_TO_END_METRIC_IDS, findDesignIssues, registry } from "@rectangles/engine";

function sendsTraffic(componentType: string): boolean {
  const metrics = registry.get(componentType)?.definition.metrics ?? [];
  return metrics.some((metric) => metric.id === END_TO_END_METRIC_IDS.offered);
}

/**
 * Why a design cannot be run yet, in words for the person building it, or `null` if it
 * can. Checks that there is something to simulate, then everything the engine checks.
 */
export function findRunBlocker(design: SimulationDesign): string | null {
  if (design.nodes.length === 0) {
    return "Add a component to the board first.";
  }
  const sources = design.nodes.filter((node) => sendsTraffic(node.type));
  if (sources.length === 0) {
    return "Add a client, so there is traffic to simulate.";
  }
  if (!sources.some((source) => design.edges.some((edge) => edge.from.node === source.id))) {
    return "Connect a client to a component, so its requests have somewhere to go.";
  }
  const [issue, ...others] = findDesignIssues(design, registry);
  if (issue === undefined) {
    return null;
  }
  return others.length === 0 ? issue.message : `${issue.message} (and ${others.length} more)`;
}
