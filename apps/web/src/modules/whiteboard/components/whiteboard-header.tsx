"use client";

import { MagnifyingGlassIcon, SidebarSimpleIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import type { ProjectSummary } from "@/modules/projects";
import { MAX_PROJECT_NAME_LENGTH, projectKeys, renameProject } from "@/modules/projects";
import type { SaveStatus as SaveStatusValue } from "../hooks/use-autosave";
import { PanelToggle } from "./panel-toggle";
import { SaveStatus } from "./save-status";

/** The project's name, editable in place. Enter or leaving the field saves it. */
function ProjectName({ project }: { project: ProjectSummary }) {
  const queryClient = useQueryClient();
  const [savedName, setSavedName] = useState(project.name);
  const [name, setName] = useState(project.name);

  const commit = () => {
    if (name.trim() === "" || name.trim() === savedName) {
      setName(savedName);
      return;
    }
    void renameProject(project.id, name).then((renamed) => {
      setSavedName(renamed.name);
      setName(renamed.name);
      void queryClient.invalidateQueries({ queryKey: projectKeys.list() });
    });
  };

  return (
    <input
      value={name}
      maxLength={MAX_PROJECT_NAME_LENGTH}
      aria-label="Project name"
      className="h-7 w-56 min-w-0 truncate rounded-md border border-transparent bg-transparent px-1.5 text-sm font-medium outline-none hover:border-border focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
      onChange={(event) => setName(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          setName(savedName);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

export function WhiteboardHeader({
  project,
  saveStatus,
  onRetrySave,
  onOpenPalette,
  toolbar,
}: {
  project: ProjectSummary;
  saveStatus: SaveStatusValue;
  onRetrySave: () => void;
  onOpenPalette: () => void;
  /** Extra controls from other modules, shown before the board's own. */
  toolbar?: React.ReactNode;
}) {
  return (
    // Equal side columns keep the actions button in the middle of the bar.
    <header className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 px-2">
      <div className="flex min-w-0 items-center gap-2">
        <PanelToggle panel="library" name="components" shortcut="[">
          <SidebarSimpleIcon aria-hidden />
        </PanelToggle>
        <ProjectName project={project} />
        <SaveStatus status={saveStatus} onRetry={onRetrySave} />
      </div>

      <Button variant="outline" size="sm" className="w-64 justify-start" onClick={onOpenPalette}>
        <MagnifyingGlassIcon aria-hidden />
        Actions
        <kbd className="ml-auto font-sans text-xs text-muted-foreground">⌘K</kbd>
      </Button>

      <div className="flex min-w-0 items-center justify-end gap-1">
        {toolbar}
        <ThemeToggle />
      </div>
    </header>
  );
}
