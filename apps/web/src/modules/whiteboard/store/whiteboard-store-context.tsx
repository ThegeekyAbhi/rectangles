"use client";

import { createContext, useContext, useState } from "react";
import type { TemporalState } from "zundo";
import { useStore } from "zustand";
import type { BoardElements } from "../types";
import type { WhiteboardState, WhiteboardStore } from "./whiteboard-store";
import { createWhiteboardStore } from "./whiteboard-store";

const WhiteboardStoreContext = createContext<WhiteboardStore | null>(null);

/** Creates the store for one open board and makes it available to everything inside. */
export function WhiteboardStoreProvider({
  initialElements,
  children,
}: {
  initialElements: BoardElements;
  children: React.ReactNode;
}) {
  const [store] = useState(() => createWhiteboardStore(initialElements));
  return <WhiteboardStoreContext value={store}>{children}</WhiteboardStoreContext>;
}

/** The store itself, for reading state inside event handlers without subscribing. */
export function useWhiteboardStoreApi(): WhiteboardStore {
  const store = useContext(WhiteboardStoreContext);
  if (store === null) {
    throw new Error("useWhiteboardStoreApi must be used inside a WhiteboardStoreProvider.");
  }
  return store;
}

export function useWhiteboardStore<Selected>(selector: (state: WhiteboardState) => Selected): Selected {
  return useStore(useWhiteboardStoreApi(), selector);
}

/** Subscribes to undo history, for example to enable and disable the undo button. */
export function useWhiteboardHistory<Selected>(
  selector: (history: TemporalState<BoardElements>) => Selected,
): Selected {
  return useStore(useWhiteboardStoreApi().temporal, selector);
}
