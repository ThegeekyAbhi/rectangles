import type { XYPosition } from "@xyflow/react";
import { useCallback, useRef, useState } from "react";

/** Pointer travel, in pixels, before a press on a library item counts as a drag. */
const DRAG_THRESHOLD = 4;

export interface DragGhost {
  readonly componentType: string;
  readonly x: number;
  readonly y: number;
}

/**
 * Drags a library item onto the canvas with pointer events, which work for mouse, pen
 * and touch alike (the HTML drag-and-drop API does not work on touch screens).
 */
export function useLibraryDrag(onDrop: (componentType: string, screenPoint: XYPosition) => void) {
  const [ghost, setGhost] = useState<DragGhost | null>(null);
  const didDragRef = useRef(false);

  const startDrag = useCallback(
    (componentType: string, event: React.PointerEvent) => {
      if (event.button !== 0) {
        return;
      }
      const start = { x: event.clientX, y: event.clientY };
      didDragRef.current = false;

      const move = (moveEvent: PointerEvent) => {
        const distance = Math.hypot(moveEvent.clientX - start.x, moveEvent.clientY - start.y);
        if (didDragRef.current || distance > DRAG_THRESHOLD) {
          didDragRef.current = true;
          setGhost({ componentType, x: moveEvent.clientX, y: moveEvent.clientY });
        }
      };
      const finish = (upEvent: PointerEvent) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        setGhost(null);
        if (!didDragRef.current || upEvent.type === "pointercancel") {
          return;
        }
        const target = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
        if (target?.closest(".react-flow") != null) {
          onDrop(componentType, { x: upEvent.clientX, y: upEvent.clientY });
        }
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
    },
    [onDrop],
  );

  /** Whether the press that just ended was a drag, so its click can be ignored. */
  const wasDrag = useCallback(() => didDragRef.current, []);

  return { ghost, startDrag, wasDrag };
}
