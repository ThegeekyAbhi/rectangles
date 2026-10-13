import type { BoardElements } from "../types";

interface Clipboard {
  readonly elements: BoardElements;
  /** How many times these elements have been pasted, for cascading the offset. */
  pasteCount: number;
}

// Held in memory for the session rather than in a board's store, so a selection
// copied on one board can be pasted onto another.
let clipboard: Clipboard | null = null;

export function writeClipboard(elements: BoardElements): void {
  clipboard = elements.nodes.length === 0 ? null : { elements, pasteCount: 0 };
}

/** Returns the copied elements and which paste this is (1 for the first). */
export function readClipboard(): { elements: BoardElements; pasteNumber: number } | null {
  if (clipboard === null) {
    return null;
  }
  clipboard.pasteCount += 1;
  return { elements: clipboard.elements, pasteNumber: clipboard.pasteCount };
}

export function clearClipboard(): void {
  clipboard = null;
}
