import type { ElkNode } from "elkjs/lib/elk-api";

interface Elk {
  layout(graph: ElkNode): Promise<ElkNode>;
}

let elk: Promise<Elk> | null = null;

/**
 * Lays out a graph off the main thread, the way ELK is meant to run in a browser: the page
 * holds only ELK's small API, and the 1.5 MB layout engine runs in a worker. Both load on
 * the first tidy, not when the board opens, and stay for the next one. If loading fails,
 * the next tidy tries again.
 */
export function layoutInWorker(graph: ElkNode): Promise<ElkNode> {
  elk ??= import("elkjs/lib/elk-api.js").then(
    ({ default: ElkApi }) =>
      new ElkApi({
        workerFactory: () => new Worker(new URL("./elk.worker.ts", import.meta.url), { type: "module" }),
      }),
    (error: unknown) => {
      elk = null;
      throw error;
    },
  );
  return elk.then((engine) => engine.layout(graph));
}
