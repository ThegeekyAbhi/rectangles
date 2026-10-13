import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { projectKeys, saveProjectDocument } from "@/modules/projects";
import { elementsToDocument, isSameDocument } from "../lib/document-conversion";
import { useWhiteboardStoreApi } from "../store/whiteboard-store-context";

const SAVE_DELAY_MS = 300;

export type SaveStatus = "saved" | "saving" | "failed";

/**
 * Saves the board shortly after every change, and at once when the tab is hidden or
 * closed, so a refresh or crash loses nothing.
 */
export function useAutosave(projectId: string): { status: SaveStatus; retry: () => void } {
  const store = useWhiteboardStoreApi();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SaveStatus>("saved");
  const flushRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    let savedElements = store.getState();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Saves run one after another, so an older board can never overwrite a newer one.
    let queue: Promise<void> = Promise.resolve();
    let isActive = true;

    const flush = () => {
      clearTimeout(timer);
      queue = queue.then(async () => {
        const elements = store.getState();
        try {
          // An edit that was undone before it was saved leaves nothing to write.
          if (!isSameDocument(elements, savedElements)) {
            await saveProjectDocument(projectId, elementsToDocument(elements.nodes, elements.edges));
            savedElements = elements;
            void queryClient.invalidateQueries({ queryKey: projectKeys.list() });
          }
          if (isActive && isSameDocument(store.getState(), savedElements)) {
            setStatus("saved");
          }
        } catch {
          if (isActive) {
            setStatus("failed");
          }
        }
      });
    };
    flushRef.current = flush;

    const unsubscribe = store.subscribe((state) => {
      if (!isSameDocument(state, savedElements)) {
        setStatus("saving");
      }
      // Flush even when the board is back to what was saved, so the status settles.
      clearTimeout(timer);
      timer = setTimeout(flush, SAVE_DELAY_MS);
    });
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };
    document.addEventListener("visibilitychange", flushWhenHidden);
    window.addEventListener("pagehide", flush);

    return () => {
      flush();
      isActive = false;
      unsubscribe();
      document.removeEventListener("visibilitychange", flushWhenHidden);
      window.removeEventListener("pagehide", flush);
    };
  }, [projectId, queryClient, store]);

  const retry = useCallback(() => {
    setStatus("saving");
    flushRef.current();
  }, []);

  return { status, retry };
}
