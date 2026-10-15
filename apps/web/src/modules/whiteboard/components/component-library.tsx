"use client";

import { DotsSixVerticalIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import type { ComponentDefinition } from "@rectangles/engine";
import { useMemo, useState } from "react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAddComponent } from "../hooks/use-add-component";
import { useLibraryDrag } from "../hooks/use-library-drag";
import { defaultConfigFor, listComponentDefinitions, summariseConfig } from "../lib/component-catalog";
import { groupByCategory } from "../lib/component-categories";
import { ComponentIconChip } from "./component-icon-chip";

/** Space between a row and its component's card, in pixels. */
const CARD_GAP = 16;

/** What a component is, at a glance: shown beside its row in the library. */
function ComponentCard({ definition }: { definition: ComponentDefinition }) {
  const defaults = summariseConfig(definition.type, defaultConfigFor(definition.type));
  const ports = definition.ports
    .map((port) => `${port.direction === "in" ? "In" : "Out"} · ${port.protocol.replaceAll("-", " ")}`)
    .join(", ");
  return (
    <>
      <span className="block text-sm font-medium">{definition.label}</span>
      <span className="mt-1 block text-muted-foreground">{definition.description}</span>
      <span className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t pt-3">
        {defaults !== null && (
          <>
            <span className="text-muted-foreground">Starts as</span>
            <span className="tabular-nums">{defaults}</span>
          </>
        )}
        <span className="text-muted-foreground">Ports</span>
        <span>{ports}</span>
      </span>
    </>
  );
}

/**
 * The palette of components, listed by section. Drag one onto the canvas, or click it
 * (or press Enter on it) to add it in the middle of the view. A row shows only an icon
 * and a name; what the component does appears in a card beside the library when the
 * row is pointed at or focused.
 */
export function ComponentLibrary() {
  const [search, setSearch] = useState("");
  const addComponent = useAddComponent();
  const { ghost, startDrag, wasDrag } = useLibraryDrag(addComponent);

  const categories = useMemo(() => {
    const query = search.trim().toLowerCase();
    return groupByCategory(
      listComponentDefinitions().filter((definition) =>
        [definition.label, definition.type, definition.description].some((text) =>
          text.toLowerCase().includes(query),
        ),
      ),
    );
  }, [search]);
  const matchCount = categories.reduce((count, category) => count + category.definitions.length, 0);

  return (
    <aside className="flex h-full flex-col" aria-label="Component library">
      <div className="px-3 pt-3 pb-2">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Components
        </h2>
        <InputGroup className="mt-2">
          <InputGroupAddon align="inline-start">
            <MagnifyingGlassIcon aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search"
            aria-label="Search components"
          />
        </InputGroup>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {categories.map((category) => (
          <section key={category.id} aria-label={category.name} className="mt-5 first:mt-2">
            <h3 className="px-2 pb-1.5 text-[0.6875rem] font-medium tracking-wider text-muted-foreground uppercase">
              {category.name}
            </h3>
            <ul>
              {category.definitions.map((definition) => (
                <li key={definition.type}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="group flex h-9 w-full cursor-grab touch-none items-center gap-2.5 rounded-md px-2 text-left outline-none select-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                        onPointerDown={(event) => startDrag(definition.type, event)}
                        onClick={() => {
                          if (!wasDrag()) {
                            addComponent(definition.type);
                          }
                        }}
                      >
                        <ComponentIconChip componentType={definition.type} />
                        <span className="min-w-0 flex-1 truncate text-sm">{definition.label}</span>
                        <DotsSixVerticalIcon
                          weight="bold"
                          className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                          aria-hidden
                        />
                      </button>
                    </TooltipTrigger>
                    {/* A card on the popover surface, not the dark tooltip chip; its arrow is hidden. */}
                    <TooltipContent
                      side="right"
                      align="start"
                      sideOffset={CARD_GAP}
                      className="block w-64 rounded-lg border bg-popover p-3 text-popover-foreground shadow-md [&>span:last-child]:invisible"
                    >
                      <ComponentCard definition={definition} />
                    </TooltipContent>
                  </Tooltip>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {matchCount === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            No component matches “{search.trim()}”.
          </p>
        )}
      </div>

      <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
        Drag onto the board, or click to add.
      </p>

      {ghost !== null && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-card shadow-md"
          style={{ left: ghost.x, top: ghost.y }}
          aria-hidden
        >
          <ComponentIconChip componentType={ghost.componentType} size="lg" />
        </div>
      )}
    </aside>
  );
}
