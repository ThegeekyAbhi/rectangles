import type { XYPosition } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { useCallback } from "react";
import { toast } from "sonner";
import { layoutScope, MIN_TIDY_COUNT, positionsFromLayout, toElkGraph } from "../lib/auto-layout/elk-graph";
import { easeOutCubic, GLIDE_MS, positionsPartWay } from "../lib/auto-layout/glide";
import { ANIMATED_FIT_VIEW_OPTIONS } from "../lib/viewport";
import type { WhiteboardStore } from "../store/whiteboard-store";
import { useWhiteboardStore, useWhiteboardStoreApi } from "../store/whiteboard-store-context";
import { layoutInWorker } from "../worker/layout-client";

/**
 * Shared by the button, the shortcut and the command palette, which each use this hook,
 * so a key press during a click cannot start a second tidy. One board is open at a time.
 */
let isTidying = false;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

/**
 * Moves components to their tidied places frame by frame, so the connections follow them.
 * Only the first frame is recorded in the undo history, as with a drag: the whole glide
 * undoes in one step, back to where everything was.
 */
async function glide(
  store: WhiteboardStore,
  from: ReadonlyMap<string, XYPosition>,
  target: ReadonlyMap<string, XYPosition>,
): Promise<void> {
  if (prefersReducedMotion()) {
    store.getState().moveNodes(target);
    return;
  }
  const progressAt = (now: number, startedAt: number) => easeOutCubic(Math.min(1, (now - startedAt) / GLIDE_MS));
  const startedAt = await nextFrame();
  // The first frame that moves anything is recorded, which stores the board as it was.
  store.getState().moveNodes(positionsPartWay(from, target, progressAt(await nextFrame(), startedAt)));
  const history = store.temporal.getState();
  history.pause();
  try {
    for (let now = await nextFrame(); now - startedAt < GLIDE_MS; now = await nextFrame()) {
      store.getState().moveNodes(positionsPartWay(from, target, progressAt(now, startedAt)));
    }
    store.getState().moveNodes(target);
  } finally {
    history.resume();
  }
}

function isSamePlace(from: ReadonlyMap<string, XYPosition>, target: ReadonlyMap<string, XYPosition>): boolean {
  return [...target].every(([id, position]) => from.get(id)?.x === position.x && from.get(id)?.y === position.y);
}

/** What tidying would act on now: the selection when two or more are selected, else the board. */
function useTidyScope(): { readonly count: number; readonly isSelection: boolean } {
  const selected = useWhiteboardStore((state) => state.nodes.filter((node) => node.selected === true).length);
  const total = useWhiteboardStore((state) => state.nodes.length);
  return selected >= MIN_TIDY_COUNT ? { count: selected, isSelection: true } : { count: total, isSelection: false };
}

interface AutoLayout {
  readonly tidy: () => Promise<void>;
  readonly canTidy: boolean;
  /** Whether a tidy now would act on the selection rather than the whole board. */
  readonly isSelection: boolean;
}

/**
 * Tidy up: lays the board, or the selection, out left to right with ELK in a worker, glides
 * everything into place, frames it, and offers to undo. A press while one is running is ignored.
 */
export function useAutoLayout(): AutoLayout {
  const store = useWhiteboardStoreApi();
  const { fitView } = useReactFlow();
  const { count, isSelection } = useTidyScope();

  const tidy = useCallback(async () => {
    if (isTidying) {
      return;
    }
    const { nodes, edges } = store.getState();
    const scope = layoutScope(
      nodes.map((node) => ({
        id: node.id,
        componentType: node.data.componentType,
        position: node.position,
        selected: node.selected === true,
      })),
      edges,
    );
    if (scope.nodes.length < MIN_TIDY_COUNT) {
      return;
    }
    isTidying = true;
    try {
      const target = positionsFromLayout(await layoutInWorker(toElkGraph(scope)), scope);
      const from = new Map(scope.nodes.map((node) => [node.id, node.position]));
      if (isSamePlace(from, target)) {
        toast.info("Already tidy", { description: "Nothing needed to move." });
        return;
      }
      await glide(store, from, target);
      void fitView(ANIMATED_FIT_VIEW_OPTIONS);
      const stepsAfterTidy = store.temporal.getState().pastStates.length;
      const tidiedSelection = scope.nodes.length < nodes.length;
      toast.success(tidiedSelection ? "Selection tidied" : "Board tidied", {
        description: `${scope.nodes.length} components laid out left to right`,
        action: {
          label: "Undo",
          onClick: () => {
            const history = store.temporal.getState();
            // Only while the tidy is still the latest change; after that, ⌘Z steps back in order.
            if (history.pastStates.length === stepsAfterTidy) {
              history.undo();
            } else {
              toast.info("Can't undo from here", {
                description: "The board changed after tidying. Use ⌘Z to step back.",
              });
            }
          },
        },
      });
    } catch (error) {
      toast.error("Couldn't tidy the board", { description: error instanceof Error ? error.message : String(error) });
    } finally {
      isTidying = false;
    }
  }, [store, fitView]);

  return { tidy, canTidy: count >= MIN_TIDY_COUNT, isSelection };
}
