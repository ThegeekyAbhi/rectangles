"use client";

import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { useAddComponent } from "../hooks/use-add-component";
import { useLibraryDrag } from "../hooks/use-library-drag";
import { listComponentDefinitions } from "../lib/component-catalog";
import { ComponentIcon } from "./component-icon";

/**
 * The palette of components. Drag one onto the canvas, or click it (or press Enter on
 * it) to add it in the middle of the view.
 */
export function ComponentLibrary() {
  const [search, setSearch] = useState("");
  const addComponent = useAddComponent();
  const { ghost, startDrag, wasDrag } = useLibraryDrag(addComponent);

  const definitions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return listComponentDefinitions().filter((definition) =>
      [definition.label, definition.type, definition.description].some((text) =>
        text.toLowerCase().includes(query),
      ),
    );
  }, [search]);

  return (
    <aside className="flex h-full flex-col" aria-label="Component library">
      <div className="p-3">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Components
        </h2>
        <div className="relative mt-2">
          <MagnifyingGlassIcon
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search"
            aria-label="Search components"
            className="pl-8"
          />
        </div>
      </div>

      <ul className="flex-1 space-y-1 overflow-y-auto p-2">
        {definitions.map((definition) => (
          <li key={definition.type}>
            <button
              type="button"
              className="flex w-full cursor-grab touch-none items-start gap-3 rounded-md p-2 text-left outline-none select-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
              onPointerDown={(event) => startDrag(definition.type, event)}
              onClick={() => {
                if (!wasDrag()) {
                  addComponent(definition.type);
                }
              }}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-card">
                <ComponentIcon componentType={definition.type} weight="duotone" className="size-4.5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{definition.label}</span>
                <span className="block text-xs text-muted-foreground">{definition.description}</span>
              </span>
            </button>
          </li>
        ))}
        {definitions.length === 0 && (
          <li className="px-2 py-6 text-center text-sm text-muted-foreground">
            No component matches “{search.trim()}”.
          </li>
        )}
      </ul>

      <p className="p-3 text-xs text-muted-foreground">
        Drag onto the board, or click to add.
      </p>

      {ghost !== null && (
        <div
          className="pointer-events-none fixed z-50 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border bg-card shadow-md"
          style={{ left: ghost.x, top: ghost.y }}
          aria-hidden
        >
          <ComponentIcon componentType={ghost.componentType} weight="duotone" className="size-5" />
        </div>
      )}
    </aside>
  );
}
