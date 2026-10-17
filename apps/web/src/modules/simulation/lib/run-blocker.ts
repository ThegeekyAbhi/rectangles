import type { DesignIssue, SimulationDesign } from "@rectangles/engine";
import { END_TO_END_METRIC_IDS, findDesignIssues, registry } from "@rectangles/engine";

function sendsTraffic(componentType: string): boolean {
  const metrics = registry.get(componentType)?.definition.metrics ?? [];
  return metrics.some((metric) => metric.id === END_TO_END_METRIC_IDS.offered);
}

/**
 * One of the engine's issues in the board's words: the component by its label and the
 * setting by its name. A setting the component does not have came from an older version.
 */
function describeIssue(issue: DesignIssue, design: SimulationDesign, labelOf: (nodeId: string) => string): string {
  const node = issue.nodeId === undefined ? undefined : design.nodes.find((candidate) => candidate.id === issue.nodeId);
  if (node === undefined || issue.field === undefined || issue.detail === undefined) {
    return issue.message;
  }
  const label = labelOf(node.id);
  const field = registry.get(node.type)?.definition.configFields[issue.field];
  if (field === undefined) {
    return `“${label}” has a setting this version no longer uses (${issue.field}). Reload the page to update it.`;
  }
  return `“${label}”, ${field.label}: ${issue.detail}`;
}

/**
 * Why a design cannot be run yet, in words for the person building it, or `null` if it
 * can. Checks that there is something to simulate, then everything the engine checks.
 * `labelOf` names components the way the board shows them.
 */
export function findRunBlocker(
  design: SimulationDesign,
  labelOf: (nodeId: string) => string = (nodeId) => nodeId,
): string | null {
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
  const described = describeIssue(issue, design, labelOf);
  return others.length === 0 ? described : `${described} (and ${others.length} more)`;
}
