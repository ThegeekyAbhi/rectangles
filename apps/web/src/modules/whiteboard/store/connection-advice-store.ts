import { create } from "zustand";
import type { RuleAdvice } from "../lib/connection-check";
import { useCanvasViewStore } from "./canvas-view-store";

export interface ConnectionAdviceState {
  /** The warning or refusal shown in the banner, or `null` when it is closed. */
  readonly advice: RuleAdvice | null;
  show(advice: RuleAdvice): void;
  close(): void;
  /** Closes the banner and stops showing its rule's warning in this browser. */
  muteAndClose(): void;
}

/** The one banner explaining a connection. Never saved: it is about the moment. */
export const useConnectionAdviceStore = create<ConnectionAdviceState>()((set, get) => ({
  advice: null,
  show(advice) {
    set({ advice });
  },
  close() {
    set({ advice: null });
  },
  muteAndClose() {
    const { advice } = get();
    if (advice !== null) {
      useCanvasViewStore.getState().muteConnectionRule(advice.ruleId);
    }
    set({ advice: null });
  },
}));
