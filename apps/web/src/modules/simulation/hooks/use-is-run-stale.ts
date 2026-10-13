import { useWhiteboardStore } from "@/modules/whiteboard";
import { isSameDesign } from "../lib/is-same-design";
import { useRunStore } from "../store/run-store-context";

/** Whether the board has changed, in a way that matters, since the shown run started. */
export function useIsRunStale(): boolean {
  const ranElements = useRunStore((state) => state.ranElements);
  return useWhiteboardStore((state) => ranElements !== null && !isSameDesign(ranElements, state));
}
