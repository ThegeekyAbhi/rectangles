import type { SimulationDesign } from "@rectangles/engine";
import type { ProjectDocument } from "@rectangles/schema";

/**
 * Every run uses the same seed, so the same board always gives the same results and
 * any difference between two runs comes from what was changed on the board.
 */
const RUN_SEED = 1;

/** Turns a saved board into the design the engine runs. Labels and positions are left out. */
export function documentToDesign(document: ProjectDocument, durationSeconds: number): SimulationDesign {
  return {
    schemaVersion: 1,
    run: { durationSeconds, seed: RUN_SEED },
    nodes: document.nodes.map((node) => ({ id: node.id, type: node.type, config: node.config })),
    edges: document.edges.map((edge) => ({ id: edge.id, from: edge.from, to: edge.to, config: edge.config })),
  };
}
