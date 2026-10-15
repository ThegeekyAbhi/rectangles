"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { PanelImperativeHandle, PanelSize } from "react-resizable-panels";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import { cn } from "@/lib/utils";
import type { BoardPanelName, BoardPanels as BoardPanelsValue } from "../hooks/use-board-panels";
import { BoardPanelsContext } from "../hooks/use-board-panels";
import { useCanvasViewStore } from "../store/canvas-view-store";
import { useWhiteboardStore } from "../store/whiteboard-store-context";

/** Sizes in pixels. A panel dragged narrower than its minimum hides completely. */
const PANEL_SIZES = {
  library: { initial: 240, min: 200, max: 400 },
  inspector: { initial: 320, min: 240, max: 480 },
  results: { initial: 320, min: 160, max: "75%" },
} as const;

/** The canvas keeps at least this much room, however the panels are dragged. */
const CANVAS_MIN_SIZE = 240;

/** A panel that floats on the app's backdrop: rounded, outlined, on the main surface. */
const FLOATING_PANEL_CLASS = "overflow-hidden rounded-xl border bg-background";

/**
 * The gap between two floating panels, which is also the handle that resizes them. A
 * hairline appears in the gap while it is pointed at, focused or dragged.
 */
const GAP_SEPARATOR_CLASS =
  "relative w-2 shrink-0 outline-none after:absolute after:inset-y-3 after:left-1/2 after:w-px after:-translate-x-1/2 after:rounded-full after:transition-colors after:duration-150 hover:after:bg-foreground/30 focus-visible:after:bg-ring data-[separator=active]:after:bg-foreground/50";

/** The line between the canvas and the results under it, inside one floating panel. */
const LINE_SEPARATOR_CLASS =
  "h-px shrink-0 bg-border outline-none transition-colors duration-150 hover:bg-foreground/30 focus-visible:bg-ring data-[separator=active]:bg-foreground/50";

interface PanelWiring {
  readonly handles: Record<BoardPanelName, React.RefObject<PanelImperativeHandle | null>>;
  reportSize(panel: BoardPanelName, size: PanelSize): void;
}

const PanelWiringContext = createContext<PanelWiring | null>(null);

/**
 * Holds which panels are showing, so the header, shortcuts and other modules can show
 * and hide them. Must wrap both `BoardPanels` and whatever controls it.
 *
 * The inspector follows the selection: it shows when something is selected and hides
 * when nothing is, unless it has been turned off.
 */
export function BoardPanelsProvider({ children }: { children: React.ReactNode }) {
  const library = useRef<PanelImperativeHandle>(null);
  const inspector = useRef<PanelImperativeHandle>(null);
  const results = useRef<PanelImperativeHandle>(null);
  // Results start hidden: there is nothing in them until the board has been run.
  const [collapsed, setCollapsed] = useState({ library: false, inspector: true, results: true });

  const isInspectorEnabled = useCanvasViewStore((state) => state.isInspectorEnabled);
  const hasSelection = useWhiteboardStore(
    (state) => state.nodes.some((node) => node.selected) || state.edges.some((edge) => edge.selected),
  );
  const shouldShowInspector = isInspectorEnabled && hasSelection;
  const shouldShowInspectorRef = useRef(shouldShowInspector);

  const { panels, wiring, expand } = useMemo(() => {
    const handles = { library, inspector, results };
    const view = () => useCanvasViewStore.getState();
    const expandPanel = (panel: BoardPanelName) => {
      const handle = handles[panel].current;
      if (handle?.isCollapsed() === true) {
        handle.resize(view().panelSizes[panel] ?? PANEL_SIZES[panel].initial);
      }
    };
    const controls: Pick<BoardPanelsValue, "show" | "toggle"> = {
      show(panel) {
        if (panel === "inspector") {
          view().setInspectorEnabled(true);
        } else {
          expandPanel(panel);
        }
      },
      toggle(panel) {
        const handle = handles[panel].current;
        if (panel === "inspector") {
          view().setInspectorEnabled(!view().isInspectorEnabled);
        } else if (handle?.isCollapsed() === false) {
          handle.collapse();
        } else {
          expandPanel(panel);
        }
      },
    };
    const panelWiring: PanelWiring = {
      handles,
      reportSize(panel, size) {
        const isCollapsed = size.inPixels < 1;
        if (!isCollapsed) {
          view().rememberPanelSize(panel, size.inPixels);
        } else if (panel === "inspector" && shouldShowInspectorRef.current) {
          // Dragged shut while something is selected: the person wants it off.
          view().setInspectorEnabled(false);
        }
        setCollapsed((current) =>
          current[panel] === isCollapsed ? current : { ...current, [panel]: isCollapsed },
        );
      },
    };
    return { panels: controls, wiring: panelWiring, expand: expandPanel };
  }, []);

  useEffect(() => {
    shouldShowInspectorRef.current = shouldShowInspector;
    if (shouldShowInspector) {
      expand("inspector");
    } else if (inspector.current?.isCollapsed() === false) {
      inspector.current.collapse();
    }
  }, [shouldShowInspector, expand]);

  const value = useMemo(
    () => ({ ...panels, collapsed, isInspectorEnabled }),
    [panels, collapsed, isInspectorEnabled],
  );

  return (
    <PanelWiringContext value={wiring}>
      <BoardPanelsContext value={value}>{children}</BoardPanelsContext>
    </PanelWiringContext>
  );
}

/**
 * The board's layout: the library on the left, the inspector on the right, and the
 * canvas between them with the results under it. The canvas and the inspector float
 * on the app's backdrop as rounded panels with gaps between them. Every gap can be
 * dragged, each panel can be hidden, and the layout is remembered in this browser.
 */
export function BoardPanels({
  library,
  canvas,
  results,
  inspector,
}: {
  library: React.ReactNode;
  canvas: React.ReactNode;
  results?: React.ReactNode;
  inspector: React.ReactNode;
}) {
  const wiring = useContext(PanelWiringContext);
  const panels = useContext(BoardPanelsContext);
  if (wiring === null || panels === null) {
    throw new Error("BoardPanels must be used inside a BoardPanelsProvider.");
  }
  const { handles, reportSize } = wiring;
  const { collapsed } = panels;
  const columns = useDefaultLayout({ id: "rectangles-board-columns" });
  const rows = useDefaultLayout({ id: "rectangles-board-rows" });

  /** What every panel that can be hidden has in common. */
  const sidePanel = (panel: BoardPanelName) =>
    ({
      id: panel,
      panelRef: handles[panel],
      minSize: PANEL_SIZES[panel].min,
      maxSize: PANEL_SIZES[panel].max,
      collapsible: true,
      collapsedSize: 0,
      // Resizing the window gives or takes room from the canvas, not from the panels.
      groupResizeBehavior: "preserve-pixel-size",
      onResize: (size: PanelSize) => reportSize(panel, size),
      // A hidden panel's contents must not be reachable by keyboard or screen reader.
      inert: collapsed[panel],
    }) as const;

  return (
    <Group
      orientation="horizontal"
      className="min-h-0 flex-1 px-2 pb-2"
      defaultLayout={columns.defaultLayout}
      onLayoutChanged={columns.onLayoutChanged}
    >
      <Panel {...sidePanel("library")} defaultSize={PANEL_SIZES.library.initial}>
        {library}
      </Panel>
      {/* A hidden panel gives up its gap too, so the canvas reaches the edge. */}
      <Separator
        className={cn(GAP_SEPARATOR_CLASS, collapsed.library && "pointer-events-none w-0")}
        aria-label="Resize component library"
      />
      <Panel id="centre" minSize={CANVAS_MIN_SIZE} className={FLOATING_PANEL_CLASS}>
        <Group
          orientation="vertical"
          defaultLayout={rows.defaultLayout}
          onLayoutChanged={rows.onLayoutChanged}
        >
          <Panel id="canvas" minSize={CANVAS_MIN_SIZE}>
            {canvas}
          </Panel>
          {results !== undefined && (
            <>
              <Separator
                className={cn(LINE_SEPARATOR_CLASS, collapsed.results && "pointer-events-none h-0")}
                aria-label="Resize results"
              />
              <Panel {...sidePanel("results")} defaultSize={0}>
                {results}
              </Panel>
            </>
          )}
        </Group>
      </Panel>
      <Separator
        className={cn(GAP_SEPARATOR_CLASS, collapsed.inspector && "pointer-events-none w-0")}
        aria-label="Resize inspector"
      />
      <Panel {...sidePanel("inspector")} defaultSize={0}>
        <div className={cn("h-full", FLOATING_PANEL_CLASS, collapsed.inspector && "hidden")}>
          {inspector}
        </div>
      </Panel>
    </Group>
  );
}
